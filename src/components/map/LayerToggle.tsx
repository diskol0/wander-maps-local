import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { ALL_LAYERS, TILE_LAYERS, type TileLayerId } from "@/lib/tile-cache";

const KEY = "sendero:layer";

export function useMapLayer() {
  const [layer, setLayer] = useState<TileLayerId>("street");
  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === "street" || stored === "sat" || stored === "topo") setLayer(stored);
  }, []);
  const update = (l: TileLayerId) => {
    setLayer(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  };
  return [layer, update] as const;
}

export function LayerToggle({
  layer,
  onChange,
  className,
}: {
  layer: TileLayerId;
  onChange: (l: TileLayerId) => void;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 rounded-full border border-border bg-background/90 p-1 shadow-sm backdrop-blur sm:gap-1 ${className ?? ""}`}
    >
      <Layers className="ml-1.5 size-3.5 shrink-0 text-muted-foreground sm:ml-2" aria-hidden />
      {ALL_LAYERS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={layer === l}
          className={`whitespace-nowrap rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs ${
            layer === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          {TILE_LAYERS[l].label}
        </button>
      ))}
    </div>
  );
}
