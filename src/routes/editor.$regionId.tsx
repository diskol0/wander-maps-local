import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MousePointerClick, Save, Trash2, Undo2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/map/MapCanvas";
import { LayerToggle, useMapLayer } from "@/components/map/LayerToggle";
import { getGrid, sampleGrid, segmentStats, type ElevationGrid } from "@/lib/elevation";
import { saveTrail } from "@/lib/my-trails";
import { getRegion, type Region } from "@/lib/tile-cache";
import type { Trail, TrailPoint } from "@/lib/trails";

export const Route = createFileRoute("/editor/$regionId")({
  head: () => ({
    meta: [
      { title: "Crear ruta sobre un mapa offline | Sendero" },
      {
        name: "description",
        content:
          "Dibuja tu ruta punto a punto sobre un mapa descargado y calcula distancia y desnivel sin conexión.",
      },
      { property: "og:title", content: "Crear ruta offline | Sendero" },
      {
        property: "og:description",
        content: "Traza rutas sobre tus mapas guardados y mide el desnivel entre dos puntos.",
      },
    ],
  }),
  component: EditorPage,
});

const ACTIVITIES: Trail["activity"][] = ["Senderismo", "BTT", "Trail running", "Alpinismo"];
const DIFFICULTIES: Trail["difficulty"][] = ["Fácil", "Moderada", "Difícil"];

function EditorPage() {
  const { regionId } = Route.useParams();
  const navigate = useNavigate();
  const [region, setRegion] = useState<Region | null>(null);
  const [grid, setGrid] = useState<ElevationGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<TrailPoint[]>([]);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [pendingA, setPendingA] = useState<number | null>(null);
  const [layer, setLayer] = useMapLayer();
  const [name, setName] = useState("");
  const [activity, setActivity] = useState<Trail["activity"]>("Senderismo");
  const [difficulty, setDifficulty] = useState<Trail["difficulty"]>("Moderada");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setRegion(await getRegion(regionId));
      setGrid(await getGrid(regionId));
      setLoading(false);
    })();
  }, [regionId]);

  const eleAt = useCallback(
    (lat: number, lon: number) => (grid ? (sampleGrid(grid, lat, lon) ?? 0) : 0),
    [grid],
  );

  const addPoint = useCallback(
    (lat: number, lon: number) => {
      setPoints((prev) => [...prev, { lat, lon, ele: eleAt(lat, lon) }]);
    },
    [eleAt],
  );

  const movePoint = useCallback(
    (index: number, lat: number, lon: number) => {
      setPoints((prev) =>
        prev.map((p, i) => (i === index ? { lat, lon, ele: eleAt(lat, lon) } : p)),
      );
    },
    [eleAt],
  );

  const selectPoint = useCallback((index: number) => {
    setPendingA((a) => {
      if (a === null) {
        setSelection(null);
        return index;
      }
      setSelection([a, index]);
      return null;
    });
  }, []);

  const total = useMemo(() => segmentStats(points), [points]);
  const segment = useMemo(() => {
    if (!selection) return null;
    const [a, b] = selection;
    const slice = points.slice(Math.min(a, b), Math.max(a, b) + 1);
    return slice.length > 1 ? segmentStats(slice) : null;
  }, [selection, points]);

  async function handleSave() {
    if (points.length < 2 || saving) return;
    setSaving(true);
    const id = `mia-${Date.now()}`;
    const trail: Trail = {
      id,
      name: name.trim() || `Ruta en ${region?.name ?? "mi mapa"}`,
      area: region?.name ?? "Mapa offline",
      activity,
      difficulty,
      distanceKm: total.distanceKm,
      ascentM: total.ascentM,
      durationH: +Math.max(0.2, total.distanceKm / 4 + total.ascentM / 500).toFixed(1),
      summary: `Ruta creada por ti sobre el mapa descargado de ${region?.name ?? "tu zona"}.`,
      points,
    };
    await saveTrail({ ...trail, createdAt: Date.now(), regionId });
    await navigate({ to: "/ruta/$trailId", params: { trailId: id } });
  }

  if (loading) {
    return (
      <AppShell>
        <p className="flex items-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando mapa…
        </p>
      </AppShell>
    );
  }

  if (!region) {
    return (
      <AppShell>
        <h1 className="text-3xl uppercase">Ese mapa ya no está</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Puede que lo hayas borrado. Descarga la zona otra vez desde el modo online.
        </p>
        <Link to="/mapas" className="mt-4 inline-block text-sm text-primary hover:underline">
          Volver a mis mapas
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/mapas"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Volver a mis mapas
      </Link>

      <header className="mb-4">
        <p className="eyebrow">Editor de rutas · {region.name}</p>
        <h1 className="mt-1 text-4xl uppercase">Dibuja tu ruta</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <MousePointerClick className="size-4" aria-hidden />
          Haz clic en el mapa para añadir puntos y arrástralos para ajustarlos. Toca dos puntos para
          medir el desnivel entre ellos.
        </p>
      </header>

      {!grid && (
        <p className="mb-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Esta zona no tiene altitudes descargadas: los desniveles saldrán a cero. Complétala desde
          el modo online.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative">
          <MapCanvas
            offlineOnly
            layer={layer}
            fitBounds={region.bounds}
            editable
            points={points}
            selection={selection}
            onAddPoint={addPoint}
            onMovePoint={movePoint}
            onSelectPoint={selectPoint}
            className="topo-panel h-[460px] overflow-hidden lg:h-[600px]"
          />
          <LayerToggle layer={layer} onChange={setLayer} className="absolute right-3 top-3 z-[500]" />
        </div>

        <div className="flex flex-col gap-4">
          <section className="topo-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl">Ruta</h2>
              <span className="text-xs text-muted-foreground">{points.length} puntos</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary px-2 py-2">
                <dt className="eyebrow">Distancia</dt>
                <dd className="font-display text-xl">{total.distanceKm} km</dd>
              </div>
              <div className="rounded-lg bg-secondary px-2 py-2">
                <dt className="eyebrow">Desnivel +</dt>
                <dd className="font-display text-xl">{total.ascentM} m</dd>
              </div>
              <div className="rounded-lg bg-secondary px-2 py-2">
                <dt className="eyebrow">Desnivel −</dt>
                <dd className="font-display text-xl">{total.descentM} m</dd>
              </div>
            </dl>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPoints((p) => p.slice(0, -1));
                  setSelection(null);
                  setPendingA(null);
                }}
                disabled={points.length === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-40"
              >
                <Undo2 className="size-4" aria-hidden /> Deshacer
              </button>
              <button
                type="button"
                onClick={() => {
                  setPoints([]);
                  setSelection(null);
                  setPendingA(null);
                }}
                disabled={points.length === 0}
                className="flex items-center justify-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="size-4" aria-hidden /> Limpiar
              </button>
            </div>
          </section>

          <section className="topo-panel p-5">
            <h2 className="text-2xl">Desnivel entre dos puntos</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingA !== null
                ? `Punto A elegido (#${pendingA + 1}). Toca ahora el punto B.`
                : selection
                  ? `Tramo #${Math.min(...selection) + 1} → #${Math.max(...selection) + 1}`
                  : "Toca dos puntos del mapa para medir el tramo."}
            </p>
            {segment && (
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ["Distancia", `${segment.distanceKm} km`],
                  ["Diferencia de cota", `${segment.deltaM > 0 ? "+" : ""}${segment.deltaM} m`],
                  ["Desnivel acumulado +", `${segment.ascentM} m`],
                  ["Desnivel acumulado −", `${segment.descentM} m`],
                  ["Pendiente media", `${segment.slopePct} %`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-display text-lg">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {selection && (
              <button
                type="button"
                onClick={() => {
                  setSelection(null);
                  setPendingA(null);
                }}
                className="mt-3 w-full rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Quitar selección
              </button>
            )}
          </section>

          <section className="topo-panel p-5">
            <h2 className="text-2xl">Guardar</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la ruta"
              className="mt-3 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value as Trail["activity"])}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
                aria-label="Actividad"
              >
                {ACTIVITIES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Trail["difficulty"])}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
                aria-label="Dificultad"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={points.length < 2 || saving}
              onClick={() => void handleSave()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Guardar ruta
            </button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
