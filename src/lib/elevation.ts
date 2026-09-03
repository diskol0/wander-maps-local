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

/** Open-Meteo elevation API: free, no key, up to 100 coords per call. */
const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";
const BATCH = 100;
/** Cap the grid so a big region stays a reasonable number of requests. */
const MAX_SIDE = 48;

function gridShape(bounds: Bounds) {
  // target ~90 m spacing
  const latSpan = Math.max(1e-6, bounds.north - bounds.south);
  const lonSpan = Math.max(1e-6, bounds.east - bounds.west);
  const step = 90 / 111320;
  const rows = Math.min(MAX_SIDE, Math.max(2, Math.round(latSpan / step)));
  const cols = Math.min(MAX_SIDE, Math.max(2, Math.round(lonSpan / step)));
  return { rows, cols };
}

export function estimateElevationRequests(bounds: Bounds) {
  const { rows, cols } = gridShape(bounds);
  return Math.ceil((rows * cols) / BATCH);
}

export async function downloadElevationGrid(
  regionId: string,
  bounds: Bounds,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ElevationGrid> {
  const { rows, cols } = gridShape(bounds);
  const lats: number[] = [];
  const lons: number[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = bounds.north - ((bounds.north - bounds.south) * r) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const lon = bounds.west + ((bounds.east - bounds.west) * c) / (cols - 1);
      lats.push(+lat.toFixed(6));
      lons.push(+lon.toFixed(6));
    }
  }

  const data = new Int16Array(rows * cols);
  const total = Math.ceil(lats.length / BATCH);
  for (let i = 0; i < lats.length; i += BATCH) {
    if (signal?.aborted) throw new Error("aborted");
    const la = lats.slice(i, i + BATCH);
    const lo = lons.slice(i, i + BATCH);
    const url = `${ELEVATION_API}?latitude=${la.join(",")}&longitude=${lo.join(",")}`;
    const res = await fetch(url, { signal: signal ?? null });
    if (!res.ok) throw new Error(`elevation ${res.status}`);
    const json = (await res.json()) as { elevation?: number[] };
    const vals = json.elevation ?? [];
    for (let k = 0; k < la.length; k++) data[i + k] = Math.round(vals[k] ?? 0);
    onProgress?.(Math.floor(i / BATCH) + 1, total);
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
