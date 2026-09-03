import { createStore, get, set, del, keys, entries } from "idb-keyval";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = "&copy; OpenStreetMap";

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
};

const tileKey = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

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

export function tileUrl(z: number, x: number, y: number) {
  return TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

export async function getCachedTile(z: number, x: number, y: number) {
  return (await get<Blob>(tileKey(z, x, y), tileStore)) ?? null;
}

export async function putTile(z: number, x: number, y: number, blob: Blob) {
  await set(tileKey(z, x, y), blob, tileStore);
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

export type DownloadProgress = { done: number; total: number; bytes: number; failed: number };

export async function downloadRegion(
  region: Omit<Region, "tiles" | "bytes" | "savedAt">,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Region> {
  const tiles = listTiles(region.bounds, region.minZoom, region.maxZoom);
  let done = 0;
  let bytes = 0;
  let failed = 0;
  const concurrency = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < tiles.length) {
      if (signal?.aborted) return;
      const t = tiles[cursor++]!;
      try {
        const existing = await getCachedTile(t.z, t.x, t.y);
        if (existing) {
          bytes += existing.size;
        } else {
          const res = await fetch(tileUrl(t.z, t.x, t.y), { signal });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          await putTile(t.z, t.x, t.y, blob);
          bytes += blob.size;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 4 === 0 || done === tiles.length) onProgress({ done, total: tiles.length, bytes, failed });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const saved: Region = { ...region, tiles: tiles.length - failed, bytes, savedAt: Date.now() };
  await saveRegion(saved);
  return saved;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
