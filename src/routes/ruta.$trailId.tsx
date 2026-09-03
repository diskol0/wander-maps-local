import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Download, MapPin, Timer, TrendingUp, Route as RouteIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/map/MapCanvas";
import { downloadGpx } from "@/lib/gpx";
import { getTrail } from "@/lib/trails";

export const Route = createFileRoute("/ruta/$trailId")({
  loader: ({ params }) => {
    const trail = getTrail(params.trailId);
    if (!trail) throw notFound();
    return { trail };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Ruta no disponible | Sendero" }, { name: "robots", content: "noindex" }],
      };
    }
    const { trail } = loaderData;
    const title = `${trail.name} — ${trail.distanceKm} km | Sendero`;
    const description = `${trail.summary} ${trail.distanceKm} km y ${trail.ascentM} m de desnivel. Descarga el GPX y úsalo offline.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: TrailDetail,
});

function TrailDetail() {
  const { trail } = Route.useLoaderData();
  const maxEle = Math.max(...trail.points.map((p) => p.ele));
  const minEle = Math.min(...trail.points.map((p) => p.ele));
  const profile = trail.points
    .map((p, i) => {
      const x = (i / (trail.points.length - 1)) * 100;
      const y = 100 - ((p.ele - minEle) / Math.max(1, maxEle - minEle)) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <AppShell>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Volver a mis rutas
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <MapPin className="size-3" aria-hidden /> {trail.area}
          </p>
          <h1 className="mt-1 text-4xl uppercase sm:text-5xl">{trail.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => downloadGpx(trail)}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Download className="size-4" aria-hidden /> Descargar GPX
        </button>
      </header>

      <MapCanvas
        points={trail.points}
        className="topo-panel mb-4 h-[420px] overflow-hidden sm:h-[520px]"
      />

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <section className="topo-panel p-5">
          <h2 className="text-2xl">Perfil de elevación</h2>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-40 w-full">
            <polyline
              points={`0,100 ${profile} 100,100`}
              fill="var(--color-primary)"
              opacity="0.18"
            />
            <polyline
              points={profile}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <p className="mt-2 text-xs text-muted-foreground">
            Cota mínima {minEle} m · cota máxima {maxEle} m
          </p>
          <p className="mt-4 text-sm text-muted-foreground">{trail.summary}</p>
        </section>

        <aside className="topo-panel space-y-3 p-5">
          <h2 className="text-2xl">Datos</h2>
          {[
            { icon: RouteIcon, label: "Distancia", value: `${trail.distanceKm} km` },
            { icon: TrendingUp, label: "Desnivel +", value: `${trail.ascentM} m` },
            { icon: Timer, label: "Duración", value: `${trail.durationH} h` },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <row.icon className="size-4" aria-hidden /> {row.label}
              </span>
              <span className="font-display text-xl">{row.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
            <span className="text-sm text-muted-foreground">Actividad</span>
            <span className="font-display text-xl">{trail.activity}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
            <span className="text-sm text-muted-foreground">Dificultad</span>
            <span className="font-display text-xl">{trail.difficulty}</span>
          </div>
          <Link
            to="/online"
            className="mt-2 block rounded-full border border-border px-4 py-2 text-center text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Descargar el mapa de esta zona
          </Link>
        </aside>
      </div>
    </AppShell>
  );
}
