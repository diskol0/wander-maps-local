import { getRegions, regionIsComplete, type Region } from "./tile-cache";
import { TRAILS, trailBounds, type Trail } from "./trails";
import { getSavedTrails } from "./my-trails";

type Bounds = Region["bounds"];

function contains(outer: Bounds, inner: Bounds) {
  return (
    outer.south <= inner.south &&
    outer.north >= inner.north &&
    outer.west <= inner.west &&
    outer.east >= inner.east
  );
}

/**
 * Returns an already-downloaded region that fully covers `bounds` at the
 * requested detail (maxZoom), so the same area is never downloaded twice.
 */
export async function findCoveringRegion(
  bounds: Bounds,
  maxZoom: number,
  excludeId?: string,
): Promise<Region | null> {
  const all = await getRegions();
  return (
    all.find(
      (r) =>
        r.id !== excludeId &&
        regionIsComplete(r) &&
        r.maxZoom >= maxZoom &&
        contains(r.bounds, bounds),
    ) ?? null
  );
}

/** Names of every trail (built-in + user-created) whose track lies inside the region. */
export async function trailsInRegion(region: Region): Promise<string[]> {
  const saved = await getSavedTrails();
  const all: Trail[] = [...TRAILS, ...saved];
  return all
    .filter((t) => contains(region.bounds, trailBounds(t)))
    .map((t) => t.name);
}

/** Confirmation message for deleting a region, naming the routes that use it. */
export async function regionDeleteMessage(region: Region): Promise<string> {
  const names = await trailsInRegion(region);
  if (names.length === 0) return `¿Borrar el mapa "${region.name}"?`;
  const list = names.slice(0, 5).join(", ");
  const more = names.length > 5 ? ` y ${names.length - 5} más` : "";
  return `El mapa "${region.name}" lo usan las rutas: ${list}${more}.\n¿Seguro que quieres borrarlo?`;
}
