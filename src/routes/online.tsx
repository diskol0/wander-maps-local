import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, HardDrive, Loader2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/map/MapCanvas";
import {
  cachedBytes,
  clearAllTiles,
  countCachedTiles,
  downloadRegion,
  formatBytes,
  getRegions,
  listTiles,
  removeRegion,
  type DownloadProgress,
  type Region,
} from "@/lib/tile-cache";

export const Route = createFileRoute("/online")({
  head: () => ({
    meta: [
      { title: "Modo online — Descargar mapas para usar offline | Sendero" },
      {
        name: "description",
        content:
          "Explora el mapa con conexión, elige una zona y descárgala para consultarla después sin internet.",
      },
      { property: "og:title", content: "Descargar mapas offline | Sendero" },
      {
        property: "og:description",
        content: "Guarda zonas del mapa en tu dispositivo y navega después sin cobertura.",
      },
    ],
  }),
  component: OnlinePage,
});

type Bounds = { south: number; west: number; north: number; east: number };

function OnlinePage() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(12);
  const [extraZoom, setExtraZoom] = useState(2);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [storage, setStorage] = useState({ tiles: 0, bytes: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    setRegions(await getRegions());
    setStorage({ tiles: await countCachedTiles(), bytes: await cachedBytes() });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const minZoom = Math.max(3, Math.min(zoom, 15));
  const maxZoom = Math.min(17, minZoom + extraZoom);
  const tileCount = bounds ? listTiles(bounds, minZoom, maxZoom).length : 0;

  const onViewChange = useCallback((b: Bounds, z: number) => {
    setBounds(b);
    setZoom(z);
  }, []);

  async function handleDownload() {
    if (!bounds || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: tileCount, bytes: 0, failed: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await downloadRegion(
        {
          id: `${Date.now()}`,
          name: name.trim() || `Zona ${new Date().toLocaleDateString("es-ES")}`,
          bounds,
          minZoom,
          maxZoom,
        },
        setProgress,
        controller.signal,
      );
      setName("");
      await refresh();
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <AppShell>
      <header className="mb-6">
        <p className="eyebrow">Modo online</p>
        <h1 className="mt-1 text-4xl uppercase">Descarga mapas para el monte</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Mueve el mapa hasta encuadrar la zona que vas a recorrer, elige cuánto detalle quieres y guárdala.
          Las teselas quedan en tu dispositivo y se usan automáticamente cuando no hay cobertura.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <MapCanvas
          onViewChange={onViewChange}
          className="topo-panel h-[440px] overflow-hidden lg:h-[560px]"
        />

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
              <span className="font-display text-2xl text-foreground">{tileCount}</span> teselas · aprox.{" "}
              {formatBytes(tileCount * 14000)}
            </p>
            {tileCount > 4000 && (
              <p className="mt-2 text-xs text-destructive">
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
                  {progress.done}/{progress.total} teselas · {formatBytes(progress.bytes)}
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
              {regions.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      zoom {r.minZoom}–{r.maxZoom} · {r.tiles} teselas · {formatBytes(r.bytes)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Quitar ${r.name}`}
                    onClick={() => void removeRegion(r.id).then(refresh)}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
              {regions.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Aún no has guardado ninguna zona.
                </li>
              )}
            </ul>
            {storage.tiles > 0 && (
              <button
                type="button"
                onClick={() => void clearAllTiles().then(refresh)}
                className="mt-4 w-full rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
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
