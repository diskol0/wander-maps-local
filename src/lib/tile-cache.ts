import { createStore, get, set, del, keys, entries } from "idb-keyval";

export type TileLayerId = "street" | "sat" | "topo";

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
  topo: {
    label: "Curvas de nivel",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Cartografía &copy; OpenTopoMap (CC-BY-SA)",
    maxZoom: 17,
  },
};

/** Finest zoom available across every layer we download. */
export const MAX_DETAIL_ZOOM = 17;

export const ALL_LAYERS: TileLayerId[] = ["street", "sat", "topo"];

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
  /** Country-level map (low zoom) so the region is findable when zoomed out. */
  overview?: { bounds: Region["bounds"]; zoom: number; tiles: number; country: string };
};

/** Regions saved before multi-layer support only contain street tiles. */
export function regionLayers(r: Region): TileLayerId[] {
  return r.layers && r.layers.length > 0 ? r.layers : ["street"];
}

export function regionIsComplete(r: Region) {
  const l = regionLayers(r);
  return ALL_LAYERS.every((x) => l.includes(x)) && r.hasElevation === true;
}

const tileKey = (layer: TileLayerId, z: number, x: number, y: number, prefix?: string) =>
  prefix
    ? `${prefix}:${layer}:${z}/${x}/${y}`
    : layer === "street"
      ? `${z}/${x}/${y}`
      : `${layer}:${z}/${x}/${y}`;

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
  const sub = ["a", "b", "c"][Math.abs(x + y) % 3]!;
  return TILE_LAYERS[layer].url
    .replace("{s}", sub)
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

export async function getCachedTile(
  layer: TileLayerId,
  z: number,
  x: number,
  y: number,
  prefix?: string,
) {
  return (await get<Blob>(tileKey(layer, z, x, y, prefix), tileStore)) ?? null;
}

export async function putTile(
  layer: TileLayerId,
  z: number,
  x: number,
  y: number,
  blob: Blob,
  prefix?: string,
) {
  await set(tileKey(layer, z, x, y, prefix), blob, tileStore);
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

/** Zoom of the country-level overview map. */
export const OVERVIEW_ZOOM = 8;
/** Cap of overview tiles per layer (keeps huge countries bounded). */
const MAX_OV_TILES = 340;

type OverviewInfo = NonNullable<Region["overview"]>;

async function fetchCountryBounds(center: { lat: number; lon: number }) {
  try {
    const rev = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${center.lat}&lon=${center.lon}&zoom=4`,
      { headers: { Accept: "application/json" } },
    );
    if (!rev.ok) return null;
    const j = (await rev.json()) as { address?: { country?: string } };
    const country = j.address?.country;
    if (!country) return null;
    const sr = await fetch(
      `https://nominatim.openstreetmap.org/search?country=${encodeURIComponent(country)}&format=json&limit=1`,
      { headers: { Accept: "application/json" } },
    );
    if (!sr.ok) return null;
    const arr = (await sr.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
    const bb = arr[0]?.boundingbox;
    if (!bb) return null;
    return {
      name: country,
      bounds: { south: +bb[0], north: +bb[1], west: +bb[2], east: +bb[3] },
    };
  } catch {
    return null;
  }
}

/**
 * Downloads a low-zoom (whole country) map so the downloaded region can still
 * be located when the user zooms far out.
 */
export async function downloadOverview(
  region: Pick<Region, "bounds"> & { layers?: TileLayerId[] },
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<OverviewInfo | null> {
  const center = {
    lat: (region.bounds.south + region.bounds.north) / 2,
    lon: (region.bounds.west + region.bounds.east) / 2,
  };
  const country = await fetchCountryBounds(center);
  if (!country) return null;

  const z = OVERVIEW_ZOOM;
  let b = country.bounds;
  let tiles = listTiles(b, z, z);
  if (tiles.length > MAX_OV_TILES) {
    // Country too big at zoom 8: fall back to the region plus margin.
    b = {
      south: region.bounds.south - 2,
      west: region.bounds.west - 2,
      north: region.bounds.north + 2,
      east: region.bounds.east + 2,
    };
    tiles = listTiles(b, z, z);
  }

  const layers = regionLayers(region as Region);
  const jobs = layers.flatMap((layer) => tiles.map((t) => ({ ...t, layer })));

  let done = 0;
  let bytes = 0;
  let failed = 0;
  const concurrency = 6;
  let cursor = 0;

  const emit = () =>
    onProgress({ done, total: jobs.length, bytes, failed, label: "Descargando mapa del país" });

  async function worker() {
    while (cursor < jobs.length) {
      if (signal?.aborted) return;
      const t = jobs[cursor++]!;
      try {
        const existing = await getCachedTile(t.layer, t.z, t.x, t.y, "ov");
        if (existing) {
          bytes += existing.size;
        } else {
          const res = await fetch(tileUrl(t.layer, t.z, t.x, t.y), { signal: signal ?? null });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          await putTile(t.layer, t.z, t.x, t.y, blob, "ov");
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
  if (signal?.aborted) return null;

  return { bounds: b, zoom: z, tiles: jobs.length - failed, country: country.name };
}
