import { DEFAULT_GPX_TRAILS } from "./default-gpx-trails";

export type TrailPoint = { lat: number; lon: number; ele: number };

export type Trail = {
  id: string;
  name: string;
  area: string;
  activity: "Senderismo" | "BTT" | "Trail running" | "Alpinismo";
  difficulty: "Fácil" | "Moderada" | "Difícil";
  distanceKm: number;
  ascentM: number;
  durationH: number;
  summary: string;
  points: TrailPoint[];
};

/** Builds a plausible ridge-like track between two points. */
function track(
  from: [number, number],
  to: [number, number],
  baseEle: number,
  peakEle: number,
  steps = 60,
  wobble = 0.0025,
): TrailPoint[] {
  const pts: TrailPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = from[0] + (to[0] - from[0]) * t + Math.sin(t * 9) * wobble;
    const lon = from[1] + (to[1] - from[1]) * t + Math.cos(t * 7) * wobble;
    const ele = Math.round(baseEle + (peakEle - baseEle) * Math.sin(t * Math.PI) + Math.sin(t * 15) * 12);
    pts.push({ lat: +lat.toFixed(6), lon: +lon.toFixed(6), ele });
  }
  return pts;
}

const ORIGINAL_TRAILS: Trail[] = [
  {
    id: "pedriza-cancho",
    name: "La Pedriza — Cancho de los Muertos",
    area: "Sierra de Guadarrama, Madrid",
    activity: "Senderismo",
    difficulty: "Moderada",
    distanceKm: 12.4,
    ascentM: 690,
    durationH: 4.5,
    summary:
      "Circular por el corazón granítico de La Pedriza, con tramos de roca pulida y vistas al valle del Manzanares.",
    points: track([40.7605, -3.8895], [40.7935, -3.8615], 1020, 1780),
  },
  {
    id: "ordesa-cola-caballo",
    name: "Ordesa — Cola de Caballo",
    area: "Pirineo de Huesca",
    activity: "Senderismo",
    difficulty: "Moderada",
    distanceKm: 17.2,
    ascentM: 780,
    durationH: 6,
    summary:
      "Ruta clásica remontando el valle glaciar hasta la cascada de Cola de Caballo bajo el Monte Perdido.",
    points: track([42.6425, -0.0785], [42.6705, -0.0225], 1310, 1760),
  },
  {
    id: "picos-cares",
    name: "Garganta del Cares",
    area: "Picos de Europa, Asturias",
    activity: "Senderismo",
    difficulty: "Fácil",
    distanceKm: 21.6,
    ascentM: 550,
    durationH: 6.5,
    summary: "La garganta divina tallada en la roca entre Poncebos y Caín, casi siempre en cornisa.",
    points: track([43.2505, -4.8305], [43.1585, -4.8175], 220, 520, 70, 0.0018),
  },
  {
    id: "teide-montana-blanca",
    name: "Montaña Blanca — Pico del Teide",
    area: "Tenerife, Canarias",
    activity: "Alpinismo",
    difficulty: "Difícil",
    distanceKm: 16.8,
    ascentM: 1380,
    durationH: 8,
    summary: "Ascensión volcánica desde Montaña Blanca hasta el cráter, terreno de picón y aire enrarecido.",
    points: track([28.2455, -16.5695], [28.2725, -16.6425], 2340, 3715, 70, 0.0012),
  },
  {
    id: "montseny-turo-home",
    name: "Turó de l'Home des de Santa Fe",
    area: "Montseny, Barcelona",
    activity: "Trail running",
    difficulty: "Moderada",
    distanceKm: 13.1,
    ascentM: 720,
    durationH: 3,
    summary: "Hayedos, brezo y la antena de la cima: la subida rápida más agradecida del Montseny.",
    points: track([41.7745, 2.4415], [41.7735, 2.4295], 1120, 1706, 55, 0.0016),
  },
  {
    id: "sierra-nevada-vereda",
    name: "Vereda de la Estrella",
    area: "Sierra Nevada, Granada",
    activity: "BTT",
    difficulty: "Difícil",
    distanceKm: 24.5,
    ascentM: 980,
    durationH: 5.5,
    summary: "Pista minera balcón sobre el Genil, con la cara norte del Mulhacén siempre enfrente.",
    points: track([37.1355, -3.4175], [37.0865, -3.3405], 1180, 1980, 75, 0.0022),
  },
];

export const TRAILS: Trail[] = [...DEFAULT_GPX_TRAILS, ...ORIGINAL_TRAILS];

export function getTrail(id: string): Trail | undefined {
  return TRAILS.find((t) => t.id === id);
}

export function trailBounds(t: Trail) {
  const lats = t.points.map((p) => p.lat);
  const lons = t.points.map((p) => p.lon);
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lons),
    east: Math.max(...lons),
  };
}
