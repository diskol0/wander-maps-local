import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Download, Loader2, Map as MapIcon, Mountain, Route as RouteIcon, Timer, Trash2, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TRAILS, type Trail } from "@/lib/trails";
import { downloadGpx } from "@/lib/gpx";
import { deleteTrail, getHiddenDemoTrails, getSavedTrails, hideDemoTrail, type SavedTrail } from "@/lib/my-trails";
import { cachedBytes, countCachedTiles, formatBytes, getRegions } from "@/lib/tile-cache";
import { DEFAULT_GPX_TRAIL_IDS } from "@/lib/default-gpx-trails";
import { downloadTrailMap } from "@/lib/offline-route-map";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sendero — Rutas de montaña offline con GPX" },
      {
        name: "description",
        content:
          "Biblioteca de rutas de montaña que funciona sin cobertura: descarga GPX, guarda mapas y navega offline.",
      },
      { property: "og:title", content: "Sendero — Rutas de montaña offline con GPX" },
      {
        property: "og:description",
        content: "Descarga rutas en GPX y mapas por zonas para usarlos sin conexión en la montaña.",
      },
    ],
  }),
  component: Index,
});

const ACTIVITIES = ["Todas", "Senderismo", "BTT", "Trail running", "Alpinismo"] as const;

function TrailCard({ trail, onDelete }: { trail: Trail; onDelete?: () => void }) {
  const isSuppliedGpx = DEFAULT_GPX_TRAIL_IDS.has(trail.id);
  const [includeMap, setIncludeMap] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadLabel, setDownloadLabel] = useState("");

  async function handleDownload() {
    downloadGpx(trail);
    if (!includeMap || downloading) return;
    setDownloading(true);
    try {
      await downloadTrailMap(trail, (progress) =>
        setDownloadLabel(`${progress.label} ${progress.done}/${progress.total}`),
      );
      setDownloadLabel("Mapa offline guardado");
    } catch {
      setDownloadLabel("No se pudo completar el mapa");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className="topo-panel flex flex-col gap-4 p-5 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{trail.area}</p>
          <h3 className="mt-1 text-2xl leading-tight">{trail.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDelete && (
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent">Mía</span>
          )}
          <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            {trail.difficulty}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{trail.summary}</p>
      {isSuppliedGpx && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={includeMap}
            onChange={(event) => setIncludeMap(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1 font-medium text-foreground">
              <MapIcon className="size-3.5" aria-hidden /> Descargar también el mapa offline
            </span>
            <span className="text-muted-foreground">Desde el encuadre de la ruta hasta el máximo detalle.</span>
          </span>
        </label>
      )}
      {downloadLabel && <p className="text-xs text-muted-foreground">{downloadLabel}</p>}
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-secondary px-3 py-2">
          <dt className="flex items-center gap-1 text-xs text-muted-foreground">
            <RouteIcon className="size-3" aria-hidden /> Dist.
          </dt>
          <dd className="font-display text-lg">{trail.distanceKm} km</dd>
        </div>
        <div className="rounded-lg bg-secondary px-3 py-2">
          <dt className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="size-3" aria-hidden /> Desnivel
          </dt>
          <dd className="font-display text-lg">{trail.ascentM} m</dd>
        </div>
        <div className="rounded-lg bg-secondary px-3 py-2">
          <dt className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="size-3" aria-hidden /> Tiempo
          </dt>
          <dd className="font-display text-lg">{trail.durationH} h</dd>
        </div>
      </dl>
      <div className="mt-auto flex gap-2">
        <Link
          to="/ruta/$trailId"
          params={{ trailId: trail.id }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Ver ruta <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} GPX
        </button>
        {onDelete && (
          <button
            type="button"
            aria-label={`Borrar ${trail.name}`}
            onClick={onDelete}
            className="rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </article>
  );
}

function Index() {
  const [activity, setActivity] = useState<(typeof ACTIVITIES)[number]>("Todas");
  const [query, setQuery] = useState("");
  const [stats, setStats] = useState({ regions: 0, tiles: 0, bytes: 0 });
  const [saved, setSaved] = useState<SavedTrail[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      setSaved(await getSavedTrails());
      setHidden(await getHiddenDemoTrails());
      setStats({
        regions: (await getRegions()).length,
        tiles: await countCachedTiles(),
        bytes: await cachedBytes(),
      });
    })();
  }, []);

  const demo = useMemo(() => TRAILS.filter((t) => !hidden.includes(t.id)), [hidden]);
  const trails = useMemo(
    () =>
      [...saved, ...demo]
        .filter((t) => activity === "Todas" || t.activity === activity)
        .filter(
        (t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.area.toLowerCase().includes(query.toLowerCase()),
      ),
    [activity, query, saved, demo],
  );

  return (
    <AppShell>
      <section className="topo-panel mb-8 overflow-hidden p-6 sm:p-8">
        <p className="eyebrow">Modo offline</p>
        <h1 className="mt-2 max-w-2xl text-4xl uppercase sm:text-5xl">
          Tus rutas y tus mapas, también sin cobertura
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Todo lo que ves aquí vive en tu dispositivo. Exporta cualquier ruta en GPX y guarda zonas de mapa
          desde el modo online para navegar en el monte sin datos.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-secondary px-4 py-3">
            <p className="eyebrow">Rutas</p>
            <p className="font-display text-3xl">{demo.length + saved.length}</p>
          </div>
          <div className="rounded-lg bg-secondary px-4 py-3">
            <p className="eyebrow">Zonas guardadas</p>
            <p className="font-display text-3xl">{stats.regions}</p>
          </div>
          <div className="rounded-lg bg-secondary px-4 py-3">
            <p className="eyebrow">Mapa en disco</p>
            <p className="font-display text-3xl">{formatBytes(stats.bytes)}</p>
          </div>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ruta o zona…"
          className="w-full max-w-xs rounded-full border border-border bg-card px-4 py-2 text-sm outline-none focus:border-primary sm:w-auto"
        />
        <div className="flex flex-wrap gap-1">
          {ACTIVITIES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setActivity(a)}
              className={`rounded-full px-3 py-2 text-sm transition-colors ${
                activity === a
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-muted"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {trails.map((t) => (
          <TrailCard
            key={t.id}
            trail={t}
            onDelete={() => {
              if (!confirm(`¿Borrar la ruta "${t.name}"?`)) return;
              if (saved.some((s) => s.id === t.id)) {
                void deleteTrail(t.id).then(async () => setSaved(await getSavedTrails()));
              } else {
                void hideDemoTrail(t.id).then(async () => setHidden(await getHiddenDemoTrails()));
              }
            }}
          />
        ))}
      </div>

      {trails.length === 0 && (
        <p className="flex items-center gap-2 py-16 text-center text-muted-foreground">
          <Mountain className="size-4" aria-hidden /> No hay rutas con ese filtro.
        </p>
      )}
    </AppShell>
  );
}
