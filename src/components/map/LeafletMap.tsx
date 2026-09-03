import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCachedTile, putTile, TILE_ATTRIBUTION, TILE_URL } from "@/lib/tile-cache";

export type LatLon = { lat: number; lon: number };

export type LeafletMapProps = {
  points?: LatLon[];
  center?: [number, number];
  zoom?: number;
  /** Only paint tiles already stored on the device. */
  offlineOnly?: boolean;
  onViewChange?: (b: { south: number; west: number; north: number; east: number }, zoom: number) => void;
  className?: string;
};

const CachedTileLayer = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: (err?: Error, tile?: HTMLElement) => void) {
    const img = document.createElement("img");
    img.alt = "";
    const offlineOnly = (this.options as { offlineOnly?: boolean }).offlineOnly;
    const url = TILE_URL.replace("{z}", String(coords.z))
      .replace("{x}", String(coords.x))
      .replace("{y}", String(coords.y));

    void (async () => {
      try {
        const cached = await getCachedTile(coords.z, coords.x, coords.y);
        if (cached) {
          img.src = URL.createObjectURL(cached);
          img.onload = () => {
            URL.revokeObjectURL(img.src);
            done(undefined, img);
          };
          return;
        }
        if (offlineOnly || (typeof navigator !== "undefined" && !navigator.onLine)) {
          img.src =
            "data:image/svg+xml;utf8," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#2b3630"/><path d="M0 256L256 0M-64 192L192 -64M64 320L320 64" stroke="#3a4740" stroke-width="1"/></svg>`,
            );
          img.onload = () => done(undefined, img);
          return;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        await putTile(coords.z, coords.x, coords.y, blob);
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
  onViewChange,
  className,
}: LeafletMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const viewCb = useRef(onViewChange);
  viewCb.current = onViewChange;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, {
      center: center ?? [40.4168, -3.7038],
      zoom,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = new (CachedTileLayer as any)(TILE_URL, {
      maxZoom: 17,
      attribution: TILE_ATTRIBUTION,
      offlineOnly,
    }) as L.TileLayer;
    layer.addTo(map);

    if (points && points.length > 1) {
      const latlngs = points.map((p) => [p.lat, p.lon] as [number, number]);
      L.polyline(latlngs, {
        color: "#f08a3c",
        weight: 4,
        opacity: 0.95,
      }).addTo(map);
      const start = latlngs[0]!;
      const end = latlngs[latlngs.length - 1]!;
      L.circleMarker(start, { radius: 6, color: "#6fd39a", fillOpacity: 1 }).addTo(map);
      L.circleMarker(end, { radius: 6, color: "#f08a3c", fillOpacity: 1 }).addTo(map);
      map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
    }

    const emit = () => {
      const b = map.getBounds();
      viewCb.current?.(
        { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
        map.getZoom(),
      );
    };
    map.on("moveend", emit);
    emit();

    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className={className} />;
}
