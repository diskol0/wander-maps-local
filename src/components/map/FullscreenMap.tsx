import { useEffect, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

export function FullscreenMap({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    document.body.style.overflow = expanded ? "hidden" : "";
    const timer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = "";
    };
  }, [expanded]);

  return (
    <div
      className={expanded ? "fixed inset-0 z-[800] bg-background p-0 [&_.sendero-map]:h-full" : `relative ${className}`}
    >
      {children}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-label={expanded ? "Salir de pantalla completa" : "Ver mapa a pantalla completa"}
        title={expanded ? "Salir de pantalla completa" : "Pantalla completa"}
        className="pointer-events-auto absolute right-3 top-3 z-[600] flex size-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur"
      >
        {expanded ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
      </button>
    </div>
  );
}