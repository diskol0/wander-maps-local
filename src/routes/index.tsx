import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Download, Mountain, Route as RouteIcon, Timer, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TRAILS, type Trail } from "@/lib/trails";
import { downloadGpx } from "@/lib/gpx";
import { cachedBytes, countCachedTiles, formatBytes, getRegions } from "@/lib/tile-cache";

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

function TrailCard({ trail }: { trail: Trail }) {
  return (
    <article className="topo-panel flex flex-col gap-4 p-5 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{trail.area}</p>
          <h3 className="mt-1 text-2xl leading-tight">{trail.name}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
          {trail.difficulty}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{trail.summary}</p>
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
          onClick={() => downloadGpx(trail)}
          className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Download className="size-4" aria-hidden /> GPX
        </button>
      </div>
    </article>
  );
}

function Index() {
  const [activity, setActivity] = useState<(typeof ACTIVITIES)[number]>("Todas");
  const [query, setQuery] = useState("");
  const [stats, setStats] = useState({ regions: 0, tiles: 0, bytes: 0 });

  useEffect(() => {
    void (async () => {
      setStats({
        regions: (await getRegions()).length,
        tiles: await countCachedTiles(),
        bytes: await cachedBytes(),
      });
    })();
  }, []);

  const trails = useMemo(
    () =>
      TRAILS.filter((t) => activity === "Todas" || t.activity === activity).filter(
        (t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.area.toLowerCase().includes(query.toLowerCase()),
      ),
    [activity, query],
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
            <p className="font-display text-3xl">{TRAILS.length}</p>
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
          <TrailCard key={t.id} trail={t} />
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
