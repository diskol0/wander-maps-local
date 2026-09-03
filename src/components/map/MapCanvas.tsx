import { Suspense, lazy, useEffect, useState } from "react";
import type { LeafletMapProps } from "./LeafletMap";

const LeafletMap = lazy(() => import("./LeafletMap"));

function MapSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-full w-full items-center justify-center rounded-[inherit] bg-secondary">
        <span className="eyebrow">Cargando mapa…</span>
      </div>
    </div>
  );
}

export function MapCanvas(props: LeafletMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <MapSkeleton className={props.className} />;
  return (
    <Suspense fallback={<MapSkeleton className={props.className} />}>
      <LeafletMap {...props} />
    </Suspense>
  );
}
