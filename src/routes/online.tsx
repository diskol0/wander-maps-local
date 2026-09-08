import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, HardDrive, Loader2, Mountain, Trash2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/map/MapCanvas";
import { LayerToggle, useMapLayer } from "@/components/map/LayerToggle";
import { downloadElevationGrid, removeGrid } from "@/lib/elevation";
import {
  ALL_LAYERS,
  cachedBytes,
  clearAllTiles,
  countCachedTiles,
  downloadRegion,
  formatBytes,
  getRegions,
  listTiles,
  regionIsComplete,
  regionLayers,
  removeRegion,
  saveRegion,
  type DownloadProgress,
  type Region,
} from "@/lib/tile-cache";

export const Route = createFileRoute("/online")({
  head: () => ({
    meta: [
      { title: "Modo online — Descargar mapas y satélite para offline | Sendero" },
      {
        name: "description",
        content:
          "Explora el mapa con conexión, elige una zona y descarga callejero, satélite y altitudes para usarla sin internet.",
      },
      { property: "og:title", content: "Descargar mapas offline | Sendero" },
      {
        property: "og:description",
        content:
          "Guarda zonas con vista callejero y satélite, más datos de altitud, y navega después sin cobertura.",
      },
    ],
  }),
  component: OnlinePage,
});

type Bounds = { south: number; west: number; north: number; east: number };

type Place = { name: string; lat: number; lon: number };

function OnlinePage() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(12);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [storage, setStorage] = useState({ tiles: 0, bytes: 0 });
  const [layer, setLayer] = useMapLayer();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    setRegions(await getRegions());
    setStorage({ tiles: await countCachedTiles(), bytes: await cachedBytes() });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSearch() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      const places = data.map((d) => ({
        name: d.display_name,
        lat: Number(d.lat),
        lon: Number(d.lon),
      }));
      setResults(places);
      if (places.length === 0) setSearchError("No se ha encontrado ese sitio.");
      else {
        const first = places[0]!;
        setFlyTo({ lat: first.lat, lon: first.lon, zoom: 13 });
        if (!name.trim()) setName(first.name.split(",")[0]!.trim());
      }
    } catch {
      setSearchError("No se ha podido buscar; comprueba la conexión.");
    } finally {
      setSearching(false);
    }
  }

  // Always download the finest detail available for every layer.
  const minZoom = Math.max(3, Math.min(zoom, MAX_DETAIL_ZOOM));
  const maxZoom = MAX_DETAIL_ZOOM;
  const tilesPerLayer = bounds ? listTiles(bounds, minZoom, maxZoom).length : 0;
  const tileCount = tilesPerLayer * ALL_LAYERS.length;

  const onViewChange = useCallback((b: Bounds, z: number) => {
    setBounds(b);
    setZoom(z);
  }, []);


  async function runDownload(region: Omit<Region, "tiles" | "bytes" | "savedAt">) {
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const saved = await downloadRegion(region, setProgress, controller.signal);
      setProgress((p) => (p ? { ...p, label: "Descargando altitudes" } : p));
      let hasElevation = false;
      try {
        await downloadElevationGrid(
          region.id,
          region.bounds,
          (done, total) =>
            setProgress({
              done,
              total,
              bytes: saved.bytes,
              failed: 0,
              label: "Descargando altitudes",
            }),
          controller.signal,
        );
        hasElevation = true;
      } catch {
        hasElevation = false;
      }
      await saveRegion({ ...saved, hasElevation });
      await refresh();
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  async function handleDownload() {
    if (!bounds || busy) return;
    await runDownload({
      id: `${Date.now()}`,
      name: name.trim() || `Zona ${new Date().toLocaleDateString("es-ES")}`,
      bounds,
      minZoom,
      maxZoom,
      layers: ALL_LAYERS,
    });
    setName("");
  }

  async function handleRemove(r: Region) {
    await removeRegion(r.id);
    await removeGrid(r.id);
    await refresh();
  }

  return (
    <AppShell>
      <header className="mb-6">
        <p className="eyebrow">Modo online</p>
        <h1 className="mt-1 text-4xl uppercase">Descarga mapas para el monte</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Encuadra la zona que vas a recorrer y guárdala. Se descargan las dos vistas —callejero y
          satélite— más las altitudes del terreno, para poder crear rutas y calcular desniveles sin
          cobertura.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative">
          <MapCanvas
            onViewChange={onViewChange}
            layer={layer}
            className="topo-panel h-[440px] overflow-hidden lg:h-[560px]"
          />
          <LayerToggle layer={layer} onChange={setLayer} className="absolute right-3 top-3 z-[500]" />
        </div>

        <div className="flex flex-col gap-4">
          <section className="topo-panel p-5">
            <h2 className="text-2xl">Zona visible</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la zona (p. ej. Ordesa)"
              className="mt-3 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <label className="mt-4 block text-sm text-muted-foreground" htmlFor="detalle">
              Nivel de detalle: zoom {minZoom}–{maxZoom}
            </label>
            <input
              id="detalle"
              type="range"
              min={0}
              max={4}
              step={1}
              value={extraZoom}
              onChange={(e) => setExtraZoom(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--color-primary)]"
            />
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-display text-2xl text-foreground">{tileCount}</span> teselas
              (callejero + satélite) · aprox. {formatBytes(tileCount * 16000)}
            </p>
            {tileCount > 6000 && (
              <p className="mt-2 flex items-start gap-1 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                Zona muy grande: reduce el detalle o acerca el mapa antes de descargar.
              </p>
            )}
            <button
              type="button"
              disabled={!bounds || busy || tileCount === 0}
              onClick={() => void handleDownload()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CloudDownload className="size-4" aria-hidden />
              )}
              {busy ? "Descargando…" : "Descargar esta zona"}
            </button>
            {progress && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-accent transition-[width]"
                    style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress.label}: {progress.done}/{progress.total} · {formatBytes(progress.bytes)}
                  {progress.failed > 0 ? ` · ${progress.failed} fallidas` : ""}
                </p>
              </div>
            )}
          </section>

          <section className="topo-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl">Zonas guardadas</h2>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <HardDrive className="size-3" aria-hidden /> {storage.tiles} teselas ·{" "}
                {formatBytes(storage.bytes)}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {regions.map((r) => {
                const complete = regionIsComplete(r);
                return (
                  <li key={r.id} className="rounded-lg bg-secondary px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          zoom {r.minZoom}–{r.maxZoom} · {r.tiles} teselas · {formatBytes(r.bytes)} ·{" "}
                          {regionLayers(r).length > 1 ? "callejero + satélite" : "solo callejero"}
                          {r.hasElevation ? " · altitudes" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${r.name}`}
                        onClick={() => void handleRemove(r)}
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                    {!complete && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runDownload({
                            id: r.id,
                            name: r.name,
                            bounds: r.bounds,
                            minZoom: r.minZoom,
                            maxZoom: r.maxZoom,
                            layers: ALL_LAYERS,
                          })
                        }
                        className="mt-2 w-full rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                      >
                        Incompleta — completar satélite y altitudes
                      </button>
                    )}
                  </li>
                );
              })}
              {regions.length === 0 && (
                <li className="text-sm text-muted-foreground">Aún no has guardado ninguna zona.</li>
              )}
            </ul>
            {regions.length > 0 && (
              <Link
                to="/mapas"
                className="mt-4 flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Mountain className="size-4" aria-hidden /> Abrir mis mapas y crear rutas
              </Link>
            )}
            {storage.tiles > 0 && (
              <button
                type="button"
                onClick={() => void clearAllTiles().then(refresh)}
                className="mt-2 w-full rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
              >
                Vaciar mapas descargados
              </button>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
