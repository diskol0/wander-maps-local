import { Link } from "@tanstack/react-router";
import { Mountain, Cloud, Compass, Map as MapIcon, Layers } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { to: "/", label: "Mis rutas", icon: MapIcon },
  { to: "/mapas", label: "Mis mapas", icon: Layers },
  { to: "/online", label: "Modo online", icon: Cloud },
  { to: "/wikiloc", label: "Wikiloc", icon: Compass },
] as const;


function OnlineBadge() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <span className="flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">
      <span
        className={`size-2 rounded-full ${online ? "bg-accent" : "bg-destructive"}`}
        aria-hidden
      />
      {online ? "Conectado" : "Sin conexión"}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Mountain className="size-6 text-primary" aria-hidden />
            <span className="font-display text-2xl uppercase tracking-[0.18em]">Sendero</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-primary text-primary-foreground" }}
                inactiveProps={{ className: "text-muted-foreground hover:bg-secondary" }}
                className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors"
              >
                <item.icon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="hidden md:block">
            <OnlineBadge />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Sendero — rutas y mapas que funcionan sin cobertura. Cartografía © OpenStreetMap.
      </footer>
    </div>
  );
}
