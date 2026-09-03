import { createStore, get, set, del, keys, entries } from "idb-keyval";

export type TileLayerId = "street" | "sat";

export const TILE_LAYERS: Record<
  TileLayerId,
  { label: string; url: string; attribution: string; maxZoom: number }
> = {
  street: {
    label: "Callejero",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  },
  sat: {
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
};

export const ALL_LAYERS: TileLayerId[] = ["street", "sat"];

/** @deprecated kept for compatibility */
export const TILE_URL = TILE_LAYERS.street.url;
export const TILE_ATTRIBUTION = TILE_LAYERS.street.attribution;

const tileStore = createStore("sendero-tiles", "tiles");
const metaStore = createStore("sendero-meta", "meta");

export type Region = {
  id: string;
  name: string;
  bounds: { south: number; west: number; north: number; east: number };
  minZoom: number;
  maxZoom: number;
  tiles: number;
  bytes: number;
  savedAt: number;
  layers?: TileLayerId[];
  hasElevation?: boolean;
};

/** Regions saved before multi-layer support only contain street tiles. */
export function regionLayers(r: Region): TileLayerId[] {
  return r.layers && r.layers.length > 0 ? r.layers : ["street"];
}

export function regionIsComplete(r: Region) {
  const l = regionLayers(r);
  return ALL_LAYERS.every((x) => l.includes(x)) && r.hasElevation === true;
}

const tileKey = (layer: TileLayerId, z: number, x: number, y: number) =>
  layer === "street" ? `${z}/${x}/${y}` : `${layer}:${z}/${x}/${y}`;

export function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

export function listTiles(
  bounds: Region["bounds"],
  minZoom: number,
  maxZoom: number,
): Array<{ z: number; x: number; y: number }> {
  const out: Array<{ z: number; x: number; y: number }> = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lonToTileX(bounds.west, z);
    const x1 = lonToTileX(bounds.east, z);
    const y0 = latToTileY(bounds.north, z);
    const y1 = latToTileY(bounds.south, z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        out.push({ z, x, y });
      }
    }
  }
  return out;
}

export function tileUrl(layer: TileLayerId, z: number, x: number, y: number) {
  return TILE_LAYERS[layer].url
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

export async function getCachedTile(layer: TileLayerId, z: number, x: number, y: number) {
  return (await get<Blob>(tileKey(layer, z, x, y), tileStore)) ?? null;
}

export async function putTile(layer: TileLayerId, z: number, x: number, y: number, blob: Blob) {
  await set(tileKey(layer, z, x, y), blob, tileStore);
}

export async function countCachedTiles() {
  return (await keys(tileStore)).length;
}

export async function cachedBytes() {
  const all = await entries<string, Blob>(tileStore);
  return all.reduce((acc, [, blob]) => acc + (blob?.size ?? 0), 0);
}

export async function getRegions(): Promise<Region[]> {
  return (await get<Region[]>("regions", metaStore)) ?? [];
}

export async function getRegion(id: string): Promise<Region | null> {
  return (await getRegions()).find((r) => r.id === id) ?? null;
}

export async function saveRegion(region: Region) {
  const all = await getRegions();
  await set("regions", [region, ...all.filter((r) => r.id !== region.id)], metaStore);
}

export async function removeRegion(id: string) {
  const all = await getRegions();
  await set(
    "regions",
    all.filter((r) => r.id !== id),
    metaStore,
  );
}

export async function clearAllTiles() {
  const ks = await keys(tileStore);
  await Promise.all(ks.map((k) => del(k, tileStore)));
  await set("regions", [], metaStore);
}

export type DownloadProgress = {
  done: number;
  total: number;
  bytes: number;
  failed: number;
  label: string;
};

export async function downloadRegion(
  region: Omit<Region, "tiles" | "bytes" | "savedAt">,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Region> {
  const layers = region.layers && region.layers.length > 0 ? region.layers : ALL_LAYERS;
  const base = listTiles(region.bounds, region.minZoom, region.maxZoom);
  const jobs = layers.flatMap((layer) => base.map((t) => ({ ...t, layer })));

  let done = 0;
  let bytes = 0;
  let failed = 0;
  const concurrency = 6;
  let cursor = 0;

  const emit = () =>
    onProgress({ done, total: jobs.length, bytes, failed, label: "Descargando mapas" });

  async function worker() {
    while (cursor < jobs.length) {
      if (signal?.aborted) return;
      const t = jobs[cursor++]!;
      try {
        const existing = await getCachedTile(t.layer, t.z, t.x, t.y);
        if (existing) {
          bytes += existing.size;
        } else {
          const res = await fetch(tileUrl(t.layer, t.z, t.x, t.y), { signal: signal ?? null });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          await putTile(t.layer, t.z, t.x, t.y, blob);
          bytes += blob.size;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 4 === 0 || done === jobs.length) emit();
    }
  }

  emit();
  await Promise.all(Array.from({ length: concurrency }, worker));

  const saved: Region = {
    ...region,
    layers,
    tiles: jobs.length - failed,
    bytes,
    savedAt: Date.now(),
  };
  await saveRegion(saved);
  return saved;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
