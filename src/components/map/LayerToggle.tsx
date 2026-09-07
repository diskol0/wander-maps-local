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
      className={`pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/90 p-1 backdrop-blur ${className ?? ""}`}
    >
      <Layers className="ml-2 size-3.5 text-muted-foreground" aria-hidden />
      {ALL_LAYERS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={layer === l}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
