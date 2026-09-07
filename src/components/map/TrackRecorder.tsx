import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDot, Loader2, Save, Square } from "lucide-react";
import { segmentStats } from "@/lib/elevation";
import { saveTrail } from "@/lib/my-trails";
import type { Trail, TrailPoint } from "@/lib/trails";

export type Recording = {
  points: TrailPoint[];
  you: TrailPoint | null;
  active: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

/** Follows the device GPS and stores the path actually walked. */
export function useTrackRecorder(): Recording {
  const [points, setPoints] = useState<TrailPoint[]>([]);
  const [you, setYou] = useState<TrailPoint | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setActive(false);
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Este dispositivo no permite usar la ubicación.");
      return;
    }
    setError(null);
    setActive(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p: TrailPoint = {
          lat: +pos.coords.latitude.toFixed(6),
          lon: +pos.coords.longitude.toFixed(6),
          ele: Math.round(pos.coords.altitude ?? 0),
        };
        setYou(p);
        setPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last && Math.abs(last.lat - p.lat) < 1e-5 && Math.abs(last.lon - p.lon) < 1e-5) {
            return prev;
          }
          return [...prev, p];
        });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Necesitas permitir el acceso a la ubicación."
            : "No se consigue señal de GPS ahora mismo.",
        );
        setActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }, []);

  const reset = useCallback(() => {
    setPoints([]);
    setYou(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { points, you, active, error, start, stop, reset };
}

export function TrackRecorderPanel({
  rec,
  areaName,
  className,
}: {
  rec: Recording;
  areaName?: string;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const stats = segmentStats(rec.points);

  async function handleSave() {
    if (rec.points.length < 2 || saving) return;
    setSaving(true);
    rec.stop();
    const id = `gps-${Date.now()}`;
    const trail: Trail = {
      id,
      name: `Seguimiento ${new Date().toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      area: areaName ?? "Seguimiento GPS",
      activity: "Senderismo",
      difficulty: "Moderada",
      distanceKm: stats.distanceKm,
      ascentM: stats.ascentM,
      durationH: +Math.max(0.1, stats.distanceKm / 4).toFixed(1),
      summary: "Recorrido grabado con el GPS mientras caminabas.",
      points: rec.points,
    };
    await saveTrail({ ...trail, createdAt: Date.now() });
    setSaved(trail.name);
    setSaving(false);
    rec.reset();
  }

  return (
    <section className={`topo-panel p-5 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl">Modo seguimiento</h2>
        <span className="text-xs text-muted-foreground">{rec.points.length} puntos</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Graba en azul el camino que estás haciendo de verdad y guárdalo cuando termines.
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary px-2 py-2">
          <dt className="eyebrow">Distancia</dt>
          <dd className="font-display text-xl">{stats.distanceKm} km</dd>
        </div>
        <div className="rounded-lg bg-secondary px-2 py-2">
          <dt className="eyebrow">Desnivel +</dt>
          <dd className="font-display text-xl">{stats.ascentM} m</dd>
        </div>
        <div className="rounded-lg bg-secondary px-2 py-2">
          <dt className="eyebrow">Desnivel −</dt>
          <dd className="font-display text-xl">{stats.descentM} m</dd>
        </div>
      </dl>

      <div className="mt-3 flex gap-2">
        {rec.active ? (
          <button
            type="button"
            onClick={rec.stop}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border px-3 py-2 text-sm transition-colors hover:border-destructive hover:text-destructive"
          >
            <Square className="size-4" aria-hidden /> Pausar
          </button>
        ) : (
          <button
            type="button"
            onClick={rec.start}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <CircleDot className="size-4" aria-hidden />
            {rec.points.length > 0 ? "Seguir grabando" : "Empezar seguimiento"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={rec.points.length < 2 || saving}
          className="flex items-center justify-center gap-2 rounded-full bg-secondary px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Guardar
        </button>
      </div>

      {rec.error && <p className="mt-3 text-xs text-destructive">{rec.error}</p>}
      {saved && (
        <p className="mt-3 text-xs text-accent">“{saved}” está guardado en tus rutas.</p>
      )}
    </section>
  );
}
