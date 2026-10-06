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

export const TRAILS: Trail[] = [...DEFAULT_GPX_TRAILS];

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
