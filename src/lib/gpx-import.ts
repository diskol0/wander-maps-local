import { getAllGrids, haversineM, makeSampler, segmentStats } from "./elevation";
import { saveTrail, type SavedTrail } from "./my-trails";
import type { Trail, TrailPoint } from "./trails";

export type ParsedGpx = {
  name: string;
  points: TrailPoint[];
};

/** Reads a GPX file (track or route) into points with elevation when present. */
export function parseGpx(xml: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("El archivo no es un GPX válido.");

  const nodes = Array.from(doc.getElementsByTagName("trkpt"));
  const list = nodes.length > 0 ? nodes : Array.from(doc.getElementsByTagName("rtept"));
  if (list.length < 2) throw new Error("El GPX no contiene ninguna ruta con puntos.");

  const points: TrailPoint[] = [];
  for (const n of list) {
    const lat = Number(n.getAttribute("lat"));
    const lon = Number(n.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleNode = n.getElementsByTagName("ele")[0];
    const ele = eleNode ? Number(eleNode.textContent) : NaN;
    points.push({ lat, lon, ele: Number.isFinite(ele) ? Math.round(ele) : 0 });
  }

  const nameNode =
    doc.getElementsByTagName("name")[0]?.textContent?.trim() ||
    doc.getElementsByTagName("trk")[0]?.getElementsByTagName("name")[0]?.textContent?.trim();

  return { name: nameNode || "Ruta importada", points };
}

/** Drops points closer than `minM` so huge tracks stay light. */
function simplify(points: TrailPoint[], minM = 15): TrailPoint[] {
  if (points.length < 3) return points;
  const out: TrailPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    if (haversineM(out[out.length - 1]!, p) >= minM) out.push(p);
  }
  out.push(points[points.length - 1]!);
  return out;
}

export type ImportOptions = {
  activity?: Trail["activity"];
  difficulty?: Trail["difficulty"];
  source?: string;
};

/** Parses a GPX and stores it in the offline library. */
export async function importGpxToLibrary(
  xml: string,
  options: ImportOptions = {},
): Promise<SavedTrail> {
  const parsed = parseGpx(xml);
  let points = simplify(parsed.points);

  // Fill missing elevations from the downloaded terrain grids when possible.
  if (points.every((p) => p.ele === 0)) {
    const sampler = makeSampler(await getAllGrids());
    points = points.map((p) => ({ ...p, ele: sampler(p.lat, p.lon) ?? 0 }));
  }

  const stats = segmentStats(points);
  const trail: SavedTrail = {
    id: `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: parsed.name,
    area: options.source ?? "Importada de un GPX",
    activity: options.activity ?? "Senderismo",
    difficulty: options.difficulty ?? "Moderada",
    distanceKm: stats.distanceKm,
    ascentM: stats.ascentM,
    durationH: +Math.max(0.2, stats.distanceKm / 4 + stats.ascentM / 500).toFixed(1),
    summary: `Ruta importada desde un archivo GPX. ${stats.distanceKm} km y ${stats.ascentM} m de desnivel positivo.`,
    points,
    createdAt: Date.now(),
  };

  await saveTrail(trail);
  return trail;
}
