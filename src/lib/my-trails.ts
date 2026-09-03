import { createStore, get, set } from "idb-keyval";
import type { Trail } from "./trails";

const store = createStore("sendero-trails", "trails");

export type SavedTrail = Trail & { createdAt: number; regionId?: string };

export async function getSavedTrails(): Promise<SavedTrail[]> {
  return (await get<SavedTrail[]>("list", store)) ?? [];
}

export async function getSavedTrail(id: string): Promise<SavedTrail | null> {
  return (await getSavedTrails()).find((t) => t.id === id) ?? null;
}

export async function saveTrail(trail: SavedTrail) {
  const all = await getSavedTrails();
  await set("list", [trail, ...all.filter((t) => t.id !== trail.id)], store);
}

export async function deleteTrail(id: string) {
  const all = await getSavedTrails();
  await set(
    "list",
    all.filter((t) => t.id !== id),
    store,
  );
}
