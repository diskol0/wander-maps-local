import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CloudDownload, Map as MapIcon, PencilLine, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/map/MapCanvas";
import { FullscreenMap } from "@/components/map/FullscreenMap";
import { LayerToggle, useMapLayer } from "@/components/map/LayerToggle";
import { TrackRecorderPanel, useTrackRecorder } from "@/components/map/TrackRecorder";
import { removeGrid } from "@/lib/elevation";
import { regionDeleteMessage } from "@/lib/region-usage";
import {
  formatBytes,
  getRegions,
  regionIsComplete,
  regionLayers,
  removeRegion,
  type Region,
} from "@/lib/tile-cache";


export const Route = createFileRoute("/mapas")({
  head: () => ({
    meta: [
      { title: "Mis mapas descargados — abrir y crear rutas | Sendero" },
      {
        name: "description",
        content:
          "Abre cualquier zona descargada en callejero o satélite y dibuja sobre ella tus propias rutas sin conexión.",
      },
      { property: "og:title", content: "Mis mapas descargados | Sendero" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Selecciona un mapa guardado, míralo offline y crea rutas encima.",
      },
    ],
  }),
  component: MapsPage,
});

function MapsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [selected, setSelected] = useState<Region | null>(null);
  const [layer, setLayer] = useMapLayer();
  const rec = useTrackRecorder();

  const load = useCallback(async () => {
    const all = await getRegions();
    setRegions(all);
    setSelected((cur) => cur ?? all[0] ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <header className="mb-6">
        <p className="eyebrow">Mis mapas</p>
        <h1 className="mt-1 text-4xl uppercase">Zonas descargadas</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Elige una zona guardada para verla sin conexión, cambia entre callejero y satélite y crea
          tu propia ruta sobre el mapa.
        </p>
      </header>

      {regions.length === 0 ? (
        <section className="topo-panel p-8 text-center">
          <MapIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 text-2xl">Todavía no hay mapas guardados</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Descarga una zona desde el modo online para empezar.
          </p>
          <Link
            to="/online"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <CloudDownload className="size-4" aria-hidden /> Ir al modo online
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          <ul className="space-y-2">
            {regions.map((r) => (
              <li key={r.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected?.id === r.id
                      ? "border-primary bg-secondary"
                      : "border-border bg-card hover:border-primary/60"
                  }`}
                >
                  <p className="font-display text-xl">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    zoom {r.minZoom}–{r.maxZoom} · {formatBytes(r.bytes)} ·{" "}
                    {regionLayers(r).length > 1 ? "callejero + satélite" : "solo callejero"}
                    {r.hasElevation ? " · altitudes" : ""}
                  </p>
                  {!regionIsComplete(r) && (
                    <p className="mt-1 text-xs text-destructive">
                      Incompleta — complétala desde el modo online
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Borrar el mapa ${r.name}`}
                  onClick={() => {
                    void (async () => {
                      if (!confirm(await regionDeleteMessage(r))) return;
                    void (async () => {
                      await removeRegion(r.id);
                      await removeGrid(r.id);
                      const all = await getRegions();
                      setRegions(all);
                      setSelected((cur) => (cur?.id === r.id ? (all[0] ?? null) : cur));
                    })();
                  }}
                  className="rounded-xl border border-border px-3 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}

          </ul>

          <div className="flex flex-col gap-3">
            <FullscreenMap>
              {selected && (
                <MapCanvas
                  key={selected.id}
                  offlineOnly
                  layer={layer}
                  fitBounds={selected.bounds}
                  overview={
                    selected.overview
                      ? { ...selected.bounds, zoom: selected.overview.zoom }
                      : null
                  }
                  detailMinZoom={selected.minZoom}
                  track={rec.points}
                  you={rec.you}
                  flyTo={rec.active && rec.you ? { lat: rec.you.lat, lon: rec.you.lon } : null}
                  className="sendero-map topo-panel h-[420px] overflow-hidden lg:h-[520px]"
                />
              )}
              <LayerToggle
                layer={layer}
                onChange={setLayer}
                className="absolute right-3 top-16 z-[500]"
              />
            </FullscreenMap>
            {selected && (
              <Link
                to="/editor/$regionId"
                params={{ regionId: selected.id }}

                className="flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <PencilLine className="size-4" aria-hidden /> Crear una ruta en {selected.name}
              </Link>
            )}
            {selected && <TrackRecorderPanel rec={rec} areaName={selected.name} />}
          </div>
        </div>
      )}
    </AppShell>
  );
}
