import { downloadElevationGrid } from "./elevation";
import { findCoveringRegion } from "./region-usage";
import { trailBounds, type Trail } from "./trails";
import {
  ALL_LAYERS,
  downloadOverview,
  downloadRegion,
  MAX_DETAIL_ZOOM,
  saveRegion,
  type DownloadProgress,
} from "./tile-cache";

function paddedBounds(trail: Trail) {
  const bounds = trailBounds(trail);
  const latPad = Math.max(0.008, (bounds.north - bounds.south) * 0.08);
  const lonPad = Math.max(0.008, (bounds.east - bounds.west) * 0.08);
  return {
    south: bounds.south - latPad,
    west: bounds.west - lonPad,
    north: bounds.north + latPad,
    east: bounds.east + lonPad,
  };
}

function fitZoom(bounds: ReturnType<typeof paddedBounds>) {
  const span = Math.max(bounds.north - bounds.south, bounds.east - bounds.west);
  return Math.max(8, Math.min(13, Math.floor(Math.log2(360 / Math.max(span, 0.001))) - 1));
}

export async function downloadTrailMap(
  trail: Trail,
  onProgress: (progress: DownloadProgress) => void,
) {
  const bounds = paddedBounds(trail);
  const regionId = `route-map-${trail.id}`;
  // Never download the same area twice: reuse a region that already covers it.
  const covering = await findCoveringRegion(bounds, MAX_DETAIL_ZOOM);
  if (covering) return covering.id;
  const saved = await downloadRegion(
    {
      id: regionId,
      name: trail.name,
      bounds,
      minZoom: fitZoom(bounds),
      maxZoom: MAX_DETAIL_ZOOM,
      layers: ALL_LAYERS,
    },
    onProgress,
  );
  await downloadElevationGrid(regionId, bounds, (done, total) =>
    onProgress({ done, total, bytes: saved.bytes, failed: 0, label: "Descargando altitudes" }),
  );
  const overview = await downloadOverview({ bounds, layers: ALL_LAYERS }, onProgress);
  await saveRegion({ ...saved, hasElevation: true, ...(overview ? { overview } : {}) });
  return regionId;
}