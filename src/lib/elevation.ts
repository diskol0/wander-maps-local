import { createStore, get, set, del, keys } from "idb-keyval";

export type Bounds = { south: number; west: number; north: number; east: number };

export type ElevationGrid = {
  bounds: Bounds;
  rows: number;
  cols: number;
  /** Row-major, from north (row 0) to south, west (col 0) to east. */
  data: Int16Array;
};

const elevStore = createStore("sendero-elevation", "grids");

/**
 * Terrain-RGB (Terrarium) tiles from the public AWS elevation dataset.
 * Free, CORS-enabled and tile-based, so a whole region needs only a handful
 * of requests instead of thousands of point queries.
 */
const TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TERRAIN_ZOOM = 12;
const TILE_PX = 256;
/** Grid resolution cap (points per side). */
const MAX_SIDE = 160;

function lonToTileXf(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTileYf(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

function gridShape(bounds: Bounds) {
  const latSpan = Math.max(1e-6, bounds.north - bounds.south);
  const lonSpan = Math.max(1e-6, bounds.east - bounds.west);
  const step = 60 / 111320;
  const rows = Math.min(MAX_SIDE, Math.max(2, Math.round(latSpan / step)));
  const cols = Math.min(MAX_SIDE, Math.max(2, Math.round(lonSpan / step)));
  return { rows, cols };
}

function terrainTiles(bounds: Bounds) {
  const z = TERRAIN_ZOOM;
  const x0 = Math.floor(lonToTileXf(bounds.west, z));
  const x1 = Math.floor(lonToTileXf(bounds.east, z));
  const y0 = Math.floor(latToTileYf(bounds.north, z));
  const y1 = Math.floor(latToTileYf(bounds.south, z));
  const out: Array<{ x: number; y: number }> = [];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push({ x, y });
  }
  return out;
}

export function estimateElevationRequests(bounds: Bounds) {
  return terrainTiles(bounds).length;
}

async function loadTerrainTile(x: number, y: number, signal?: AbortSignal) {
  const url = TERRAIN_URL.replace("{z}", String(TERRAIN_ZOOM))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: signal ?? null });
      if (!res.ok) throw new Error(`terrain ${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      bmp.close();
      const ele = new Int16Array(bmp.width * bmp.height);
      for (let i = 0; i < ele.length; i++) {
        const r = px[i * 4]!;
        const g = px[i * 4 + 1]!;
        const b = px[i * 4 + 2]!;
        ele[i] = Math.round(r * 256 + g + b / 256 - 32768);
      }
      return ele;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("terrain");
}

export async function downloadElevationGrid(
  regionId: string,
  bounds: Bounds,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ElevationGrid> {
  const { rows, cols } = gridShape(bounds);
  const tiles = terrainTiles(bounds);
  const cache = new Map<string, Int16Array>();

  let done = 0;
  for (const t of tiles) {
    if (signal?.aborted) throw new Error("aborted");
    cache.set(`${t.x}/${t.y}`, await loadTerrainTile(t.x, t.y, signal));
    done++;
    onProgress?.(done, tiles.length);
  }

  const data = new Int16Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const lat = bounds.north - ((bounds.north - bounds.south) * r) / (rows - 1);
    const fy = latToTileYf(lat, TERRAIN_ZOOM);
    for (let c = 0; c < cols; c++) {
      const lon = bounds.west + ((bounds.east - bounds.west) * c) / (cols - 1);
      const fx = lonToTileXf(lon, TERRAIN_ZOOM);
      const tile = cache.get(`${Math.floor(fx)}/${Math.floor(fy)}`);
      if (!tile) continue;
      const px = Math.min(TILE_PX - 1, Math.floor((fx % 1) * TILE_PX));
      const py = Math.min(TILE_PX - 1, Math.floor((fy % 1) * TILE_PX));
      data[r * cols + c] = tile[py * TILE_PX + px] ?? 0;
    }
  }

  const grid: ElevationGrid = { bounds, rows, cols, data };
  await saveGrid(regionId, grid);
  return grid;
}

type StoredGrid = Omit<ElevationGrid, "data"> & { data: number[] };

export async function saveGrid(regionId: string, grid: ElevationGrid) {
  const stored: StoredGrid = { ...grid, data: Array.from(grid.data) };
  await set(regionId, stored, elevStore);
}

export async function getGrid(regionId: string): Promise<ElevationGrid | null> {
  const s = await get<StoredGrid>(regionId, elevStore);
  if (!s) return null;
  return { ...s, data: Int16Array.from(s.data) };
}

export async function removeGrid(regionId: string) {
  await del(regionId, elevStore);
}

export async function getAllGrids(): Promise<ElevationGrid[]> {
  const ks = await keys(elevStore);
  const out: ElevationGrid[] = [];
  for (const k of ks) {
    const g = await getGrid(String(k));
    if (g) out.push(g);
  }
  return out;
}

function inBounds(b: Bounds, lat: number, lon: number) {
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

/** Bilinear sample; returns null when the point is outside the grid. */
export function sampleGrid(grid: ElevationGrid, lat: number, lon: number): number | null {
  const { bounds: b, rows, cols, data } = grid;
  if (!inBounds(b, lat, lon)) return null;
  const fr = ((b.north - lat) / (b.north - b.south)) * (rows - 1);
  const fc = ((lon - b.west) / (b.east - b.west)) * (cols - 1);
  const r0 = Math.min(rows - 1, Math.max(0, Math.floor(fr)));
  const c0 = Math.min(cols - 1, Math.max(0, Math.floor(fc)));
  const r1 = Math.min(rows - 1, r0 + 1);
  const c1 = Math.min(cols - 1, c0 + 1);
  const dr = fr - r0;
  const dc = fc - c0;
  const v = (r: number, c: number) => data[r * cols + c] ?? 0;
  const top = v(r0, c0) * (1 - dc) + v(r0, c1) * dc;
  const bot = v(r1, c0) * (1 - dc) + v(r1, c1) * dc;
  return Math.round(top * (1 - dr) + bot * dr);
}

/** Sampler over every downloaded grid (offline). */
export function makeSampler(grids: ElevationGrid[]) {
  return (lat: number, lon: number): number | null => {
    for (const g of grids) {
      const v = sampleGrid(g, lat, lon);
      if (v !== null) return v;
    }
    return null;
  };
}

export function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type SegmentStats = {
  distanceKm: number;
  ascentM: number;
  descentM: number;
  deltaM: number;
  slopePct: number;
};

export function segmentStats(
  points: Array<{ lat: number; lon: number; ele: number }>,
): SegmentStats {
  let dist = 0;
  let up = 0;
  let down = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    dist += haversineM(a, b);
    const d = b.ele - a.ele;
    if (d > 0) up += d;
    else down -= d;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const delta = first && last ? last.ele - first.ele : 0;
  return {
    distanceKm: +(dist / 1000).toFixed(2),
    ascentM: Math.round(up),
    descentM: Math.round(down),
    deltaM: Math.round(delta),
    slopePct: dist > 0 ? +((delta / dist) * 100).toFixed(1) : 0,
  };
}

/**
 * Adds intermediate points every ~stepM metres between the given anchors and
 * samples their elevation, so straight segments still produce a realistic
 * distance/ascent profile.
 */
export function densify(
  points: Array<{ lat: number; lon: number; ele: number }>,
  eleAt: (lat: number, lon: number) => number,
  stepM = 60,
): Array<{ lat: number; lon: number; ele: number }> {
  if (points.length < 2) return points;
  const out: Array<{ lat: number; lon: number; ele: number }> = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = haversineM(a, b);
    const steps = Math.min(400, Math.max(1, Math.round(d / stepM)));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      out.push(k === steps ? { ...b, ele: eleAt(b.lat, b.lon) } : { lat, lon, ele: eleAt(lat, lon) });
    }
  }
  return out;
}

/* ---------- Live terrain sampler (falls back when the saved grid has no value) ---------- */

const terrainStore = createStore("sendero-terrain", "tiles");
const liveTiles = new Map<string, Int16Array>();
const pending = new Map<string, Promise<void>>();

function tileKeyFor(lat: number, lon: number) {
  const fx = lonToTileXf(lon, TERRAIN_ZOOM);
  const fy = latToTileYf(lat, TERRAIN_ZOOM);
  return { key: `${Math.floor(fx)}/${Math.floor(fy)}`, fx, fy };
}

/** Synchronous sample from terrain tiles already in memory; null if not loaded. */
export function sampleLive(lat: number, lon: number): number | null {
  const { key, fx, fy } = tileKeyFor(lat, lon);
  const t = liveTiles.get(key);
  if (!t) return null;
  const px = Math.min(TILE_PX - 1, Math.floor((fx % 1) * TILE_PX));
  const py = Math.min(TILE_PX - 1, Math.floor((fy % 1) * TILE_PX));
  return t[py * TILE_PX + px] ?? null;
}

async function ensureTile(key: string) {
  if (liveTiles.has(key)) return;
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const stored = await get<Int16Array>(key, terrainStore).catch(() => undefined);
      if (stored) {
        liveTiles.set(key, stored);
        return;
      }
      const [x, y] = key.split("/").map(Number) as [number, number];
      const ele = await loadTerrainTile(x, y);
      liveTiles.set(key, ele);
      await set(key, ele, terrainStore).catch(() => {});
    })().finally(() => pending.delete(key));
    pending.set(key, p);
  }
  await p.catch((e) => console.warn("terrain tile failed", key, e));
}

/** Loads (from device or network) the terrain tiles covering these points. */
export async function ensureTerrainFor(points: Array<{ lat: number; lon: number }>) {
  const keys = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    keys.add(tileKeyFor(a.lat, a.lon).key);
    const b = points[i + 1];
    if (b) {
      for (let k = 1; k < 10; k++) {
        const t = k / 10;
        keys.add(tileKeyFor(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t).key);
      }
    }
  }
  await Promise.all([...keys].map(ensureTile));
}
