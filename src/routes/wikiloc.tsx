import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Compass, ExternalLink, FileUp, Link2, Loader2, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { importGpxToLibrary } from "@/lib/gpx-import";
import { fetchRemoteGpx } from "@/lib/remote-gpx.functions";

export const Route = createFileRoute("/wikiloc")({
  head: () => ({
    meta: [
      { title: "Buscar rutas en Wikiloc e importar GPX | Sendero" },
      {
        name: "description",
        content:
          "Busca rutas en Wikiloc, descarga su GPX y añádelo a tu biblioteca offline de Sendero en un toque.",
      },
      { property: "og:title", content: "Importar rutas de Wikiloc | Sendero" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Trae cualquier GPX a Sendero y úsalo sin cobertura.",
      },
    ],
  }),
  component: WikilocPage,
});

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

function WikilocPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Opening this page with ?abrir=1 pops the device file browser straight away.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("abrir") === "1") {
      fileInput.current?.click();
    }
  }, []);

  const searchUrl = query.trim()
    ? `https://www.wikiloc.com/wikiloc/find.do?q=${encodeURIComponent(query.trim())}`
    : "https://www.wikiloc.com/";

  async function importText(xml: string, source: string) {
    const trail = await importGpxToLibrary(xml, { source });
    setStatus({ kind: "ok", text: `“${trail.name}” está ya en tu biblioteca.` });
    await navigate({ to: "/ruta/$trailId", params: { trailId: trail.id } });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus({ kind: "busy" });
    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        await importText(text, "Importada de Wikiloc");
      }
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "No se pudo leer el archivo." });
    }
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setStatus({ kind: "busy" });
    try {
      const res = await fetchRemoteGpx({ data: { url: url.trim() } });
      if (!res.ok) {
        setStatus({
          kind: "error",
          text: `${res.error} Descarga el GPX desde Wikiloc y súbelo aquí abajo.`,
        });
        return;
      }
      await importText(res.xml, "Importada desde un enlace");
    } catch {
      setStatus({
        kind: "error",
        text: "No se pudo traer ese enlace. Descarga el GPX y súbelo aquí abajo.",
      });
    }
  }

  return (
    <AppShell>
      <header className="mb-6">
        <p className="eyebrow">Buscar rutas</p>
        <h1 className="mt-1 text-4xl uppercase">Trae rutas de Wikiloc</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Busca la ruta en Wikiloc, descarga su archivo GPX y suéltalo aquí: se guarda en tu
          biblioteca y funciona sin cobertura, con su mapa, perfil y desniveles.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="topo-panel p-5">
          <h2 className="flex items-center gap-2 text-2xl">
            <Compass className="size-5 text-primary" aria-hidden /> Buscar en Wikiloc
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Wikiloc no permite abrirse dentro de otras apps, así que se abre en una pestaña nueva.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") window.open(searchUrl, "_blank", "noopener");
              }}
              placeholder="Sierra de Guadarrama, Ordesa, Cares…"
              className="w-full rounded-full border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Search className="size-4" aria-hidden /> Buscar
            </a>
          </div>
          <ol className="mt-5 space-y-2 text-sm text-muted-foreground">
            <li>1. Abre la ruta que te guste en Wikiloc.</li>
            <li>2. Pulsa “Descargar” y elige el archivo GPX.</li>
            <li>3. Vuelve aquí y suéltalo en el recuadro de la derecha.</li>
          </ol>
          <a
            href="https://www.wikiloc.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden /> Abrir Wikiloc
          </a>
        </section>

        <section className="topo-panel p-5">
          <h2 className="flex items-center gap-2 text-2xl">
            <FileUp className="size-5 text-primary" aria-hidden /> Añadir un GPX
          </h2>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <FileUp className="size-4" aria-hidden /> Buscar el GPX en mi dispositivo
          </button>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
            }}
            className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? "border-primary bg-secondary" : "border-border hover:border-primary"
            }`}
          >
            <FileUp className="mx-auto size-7 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm">Suelta aquí tus archivos .gpx</p>
            <p className="text-xs text-muted-foreground">o toca para elegirlos del dispositivo</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".gpx,application/gpx+xml,application/octet-stream,application/xml,text/xml"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />

          <div className="mt-5">
            <label className="eyebrow flex items-center gap-2" htmlFor="gpx-url">
              <Link2 className="size-3.5" aria-hidden /> O pega el enlace directo a un GPX
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="gpx-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/ruta.gpx"
                className="w-full rounded-full border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => void handleUrl()}
                disabled={status.kind === "busy"}
                className="shrink-0 rounded-full border border-border px-4 py-2.5 text-sm transition-colors hover:border-primary disabled:opacity-50"
              >
                Traer
              </button>
            </div>
          </div>

          {status.kind === "busy" && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Importando…
            </p>
          )}
          {status.kind === "ok" && <p className="mt-4 text-sm text-accent">{status.text}</p>}
          {status.kind === "error" && (
            <p className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {status.text}
            </p>
          )}

          <Link to="/" className="mt-5 inline-block text-sm text-primary hover:underline">
            Ver mi biblioteca de rutas
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
