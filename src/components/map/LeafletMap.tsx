import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCachedTile, putTile, tileUrl, TILE_LAYERS, type TileLayerId } from "@/lib/tile-cache";

export type LatLon = { lat: number; lon: number };

export type LeafletMapProps = {
  points?: LatLon[];
  center?: [number, number];
  zoom?: number;
  /** Only paint tiles already stored on the device. */
  offlineOnly?: boolean;
  layer?: TileLayerId;
  /** Fit the map to these bounds on mount. */
  fitBounds?: { south: number; west: number; north: number; east: number };
  /** Drawing mode: clicking the map appends a point. */
  editable?: boolean;
  onAddPoint?: (lat: number, lon: number) => void;
  onMovePoint?: (index: number, lat: number, lon: number) => void;
  /** Clicking an existing point reports its index (used for the A/B selection). */
  onSelectPoint?: (index: number) => void;
  /** Highlighted sub-segment [from, to] over `points`. */
  selection?: [number, number] | null;
  /** Live recorded track (drawn in a distinct colour). */
  track?: LatLon[];
  /** Current GPS position marker. */
  you?: LatLon | null;
  /** Recenter the map on this position when it changes. */
  flyTo?: { lat: number; lon: number; zoom?: number } | null;
  onViewChange?: (b: { south: number; west: number; north: number; east: number }, zoom: number) => void;
  className?: string;
};


const OFFLINE_TILE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#2b3630"/><path d="M0 256L256 0M-64 192L192 -64M64 320L320 64" stroke="#3a4740" stroke-width="1"/></svg>`,
  );

const CachedTileLayer = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: (err?: Error, tile?: HTMLElement) => void) {
    const img = document.createElement("img");
    img.alt = "";
    const opts = this.options as { offlineOnly?: boolean; layerId?: TileLayerId };
    const layerId: TileLayerId = opts.layerId ?? "street";
    const offlineOnly = opts.offlineOnly;
    const spec = TILE_LAYERS[layerId];
    const url = tileUrl(layerId, coords.z, coords.x, coords.y);

    void (async () => {
      try {
        const cached = await getCachedTile(layerId, coords.z, coords.x, coords.y);
        if (cached) {
          img.src = URL.createObjectURL(cached);
          img.onload = () => {
            URL.revokeObjectURL(img.src);
            done(undefined, img);
          };
          return;
        }
        if (offlineOnly || (typeof navigator !== "undefined" && !navigator.onLine)) {
          img.src = OFFLINE_TILE;
          img.onload = () => done(undefined, img);
          return;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        await putTile(layerId, coords.z, coords.x, coords.y, blob);
        img.src = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(img.src);
          done(undefined, img);
        };
      } catch (err) {
        done(err as Error, img);
      }
    })();

    return img;
  },
});

export default function LeafletMap({
  points,
  center,
  zoom = 12,
  offlineOnly = false,
  layer = "street",
  fitBounds,
  editable = false,
  onAddPoint,
  onMovePoint,
  onSelectPoint,
  selection = null,
  onViewChange,
  className,
}: LeafletMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);

  const cb = useRef({ onViewChange, onAddPoint, onMovePoint, onSelectPoint });
  cb.current = { onViewChange, onAddPoint, onMovePoint, onSelectPoint };

  // Map init
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, {
      center: center ?? [40.4168, -3.7038],
      zoom,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);

    if (fitBounds) {
      map.fitBounds(
        L.latLngBounds(
          [fitBounds.south, fitBounds.west],
          [fitBounds.north, fitBounds.east],
        ),
      );
      fittedRef.current = true;
    }

    const emit = () => {
      const b = map.getBounds();
      cb.current.onViewChange?.(
        { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
        map.getZoom(),
      );
    };
    map.on("moveend", emit);
    map.on("click", (e: L.LeafletMouseEvent) => {
      cb.current.onAddPoint?.(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6));
    });
    emit();

    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer (swaps when the basemap changes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const spec = TILE_LAYERS[layer];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tl = new (CachedTileLayer as any)(spec.url, {
      maxZoom: 19,
      attribution: spec.attribution,
      offlineOnly,
      layerId: layer,
    }) as L.TileLayer;
    tl.addTo(map);
    tl.bringToBack();
    tileRef.current = tl;
  }, [layer, offlineOnly]);

  // Track + markers
  useEffect(() => {
    const map = mapRef.current;
    const group = overlayRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const pts = points ?? [];
    const latlngs = pts.map((p) => [p.lat, p.lon] as [number, number]);

    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: "#f08a3c", weight: 4, opacity: 0.95 }).addTo(group);
    }

    if (selection && latlngs.length > 1) {
      const [a, b] = selection;
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      const seg = latlngs.slice(from, to + 1);
      if (seg.length > 1) {
        L.polyline(seg, { color: "#6fd39a", weight: 7, opacity: 0.9 }).addTo(group);
      }
    }

    pts.forEach((p, i) => {
      const isEdge = i === 0 || i === pts.length - 1;
      const isSelected = selection?.includes(i) ?? false;
      if (editable) {
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: isSelected ? 8 : 6,
          color: isSelected ? "#6fd39a" : i === 0 ? "#6fd39a" : "#f08a3c",
          fillColor: isSelected ? "#6fd39a" : "#f08a3c",
          fillOpacity: 1,
          weight: 2,
        }).addTo(group);
        marker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelectPoint?.(i);
        });
        marker.on("mousedown", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const move = (ev: L.LeafletMouseEvent) => {
            marker.setLatLng(ev.latlng);
          };
          const up = (ev: L.LeafletMouseEvent) => {
            map.off("mousemove", move);
            map.off("mouseup", up);
            map.dragging.enable();
            cb.current.onMovePoint?.(i, +ev.latlng.lat.toFixed(6), +ev.latlng.lng.toFixed(6));
          };
          map.dragging.disable();
          map.on("mousemove", move);
          map.on("mouseup", up);
        });
      } else if (isEdge || isSelected || (onSelectPoint && i % 6 === 0)) {
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: isSelected ? 8 : isEdge ? 6 : 4,
          color: isSelected ? "#6fd39a" : i === 0 ? "#6fd39a" : "#f08a3c",
          fillColor: isSelected ? "#6fd39a" : i === 0 ? "#6fd39a" : "#f08a3c",
          fillOpacity: isSelected || isEdge ? 1 : 0.5,
          weight: 2,
        }).addTo(group);
        if (onSelectPoint) {
          marker.on("click", (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            cb.current.onSelectPoint?.(i);
          });
        }
      }
    });

    if (!fittedRef.current && latlngs.length > 1) {
      map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
      fittedRef.current = true;
    }
  }, [points, selection, editable, onSelectPoint]);

  return <div ref={ref} className={className} />;
}
