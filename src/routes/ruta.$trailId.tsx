import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  MapPin,
  Timer,
  TrendingUp,
  Route as RouteIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/map/MapCanvas";
import { LayerToggle, useMapLayer } from "@/components/map/LayerToggle";
import { downloadGpx } from "@/lib/gpx";
import { getTrail, type Trail } from "@/lib/trails";
import { getSavedTrail } from "@/lib/my-trails";
import { segmentStats } from "@/lib/elevation";

export const Route = createFileRoute("/ruta/$trailId")({
  loader: ({ params }) => ({ trail: getTrail(params.trailId) ?? null }),
  head: ({ loaderData }) => {
    if (!loaderData?.trail) {
      return {
        meta: [
          { title: "Ruta guardada | Sendero" },
          {
            name: "description",
            content: "Detalle de una ruta guardada en tu dispositivo, con mapa y perfil de elevación.",
          },
          { property: "og:title", content: "Ruta guardada | Sendero" },
          {
            property: "og:description",
            content: "Mapa, perfil de elevación y descarga GPX de tu ruta.",
          },
          { name: "robots", content: "noindex" },
        ],
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
  const { trailId } = Route.useParams();
  const { trail: staticTrail } = Route.useLoaderData();
  const [trail, setTrail] = useState<Trail | null>(staticTrail);
  const [loading, setLoading] = useState(!staticTrail);

  useEffect(() => {
    if (staticTrail) return;
    void (async () => {
      setTrail(await getSavedTrail(trailId));
      setLoading(false);
    })();
  }, [staticTrail, trailId]);

  if (loading) {
    return (
      <AppShell>
        <p className="flex items-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando ruta…
        </p>
      </AppShell>
    );
  }

  if (!trail) {
    return (
      <AppShell>
        <h1 className="text-3xl uppercase">No encontramos esa ruta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Puede que la hayas borrado o que esté guardada en otro dispositivo.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Volver a mis rutas
        </Link>
      </AppShell>
    );
  }

  return <TrailView trail={trail} />;
}

function TrailView({ trail }: { trail: Trail }) {
  const [layer, setLayer] = useMapLayer();
  const [pendingA, setPendingA] = useState<number | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);

  const maxEle = Math.max(...trail.points.map((p) => p.ele));
  const minEle = Math.min(...trail.points.map((p) => p.ele));
  const profile = trail.points
    .map((p, i) => {
      const x = (i / (trail.points.length - 1)) * 100;
      const y = 100 - ((p.ele - minEle) / Math.max(1, maxEle - minEle)) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const pick = (index: number) => {
    setPendingA((a) => {
      if (a === null) {
        setSelection(null);
        return index;
      }
      setSelection([a, index]);
      return null;
    });
  };

  const segment = useMemo(() => {
    if (!selection) return null;
    const [a, b] = selection;
    const slice = trail.points.slice(Math.min(a, b), Math.max(a, b) + 1);
    return slice.length > 1 ? segmentStats(slice) : null;
  }, [selection, trail.points]);

  const selRange = selection
    ? ([Math.min(...selection), Math.max(...selection)] as [number, number])
    : null;

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

      <div className="relative mb-4">
        <MapCanvas
          points={trail.points}
          layer={layer}
          selection={selection}
          onSelectPoint={pick}
          className="topo-panel h-[420px] overflow-hidden sm:h-[520px]"
        />
        <LayerToggle layer={layer} onChange={setLayer} className="absolute right-3 top-3 z-[500]" />
      </div>

      <section className="topo-panel mb-4 p-5">
        <h2 className="text-2xl">Desnivel entre dos puntos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {pendingA !== null
            ? `Punto A elegido (#${pendingA + 1}). Toca ahora el punto B en el mapa o en el perfil.`
            : segment
              ? `Tramo #${selRange![0] + 1} → #${selRange![1] + 1}`
              : "Toca dos puntos del mapa o del perfil de elevación para medir el tramo."}
        </p>
        {segment && (
          <dl className="mt-3 grid gap-2 sm:grid-cols-5">
            {[
              ["Distancia", `${segment.distanceKm} km`],
              ["Dif. de cota", `${segment.deltaM > 0 ? "+" : ""}${segment.deltaM} m`],
              ["Desnivel +", `${segment.ascentM} m`],
              ["Desnivel −", `${segment.descentM} m`],
              ["Pendiente", `${segment.slopePct} %`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-secondary px-3 py-2">
                <dt className="eyebrow">{k}</dt>
                <dd className="font-display text-xl">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {(segment || pendingA !== null) && (
          <button
            type="button"
            onClick={() => {
              setSelection(null);
              setPendingA(null);
            }}
            className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Quitar selección
          </button>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <section className="topo-panel p-5">
          <h2 className="text-2xl">Perfil de elevación</h2>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="mt-3 h-40 w-full cursor-crosshair"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              const idx = Math.round(ratio * (trail.points.length - 1));
              pick(Math.min(trail.points.length - 1, Math.max(0, idx)));
            }}
          >
            <polyline points={`0,100 ${profile} 100,100`} fill="var(--color-primary)" opacity="0.18" />
            {selRange && (
              <rect
                x={(selRange[0] / (trail.points.length - 1)) * 100}
                y={0}
                width={((selRange[1] - selRange[0]) / (trail.points.length - 1)) * 100}
                height={100}
                fill="var(--color-accent)"
                opacity="0.22"
              />
            )}
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
