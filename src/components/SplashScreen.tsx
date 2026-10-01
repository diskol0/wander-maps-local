import { useEffect, useState } from "react";

/** Black launch screen with the app logo and name, shown briefly on start-up. */
export function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const a = setTimeout(() => setFading(true), 1100);
    const b = setTimeout(() => setVisible(false), 1600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  if (!mounted || !visible) return null;


  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <img
        src="/icons/icon-512.png"
        alt=""
        className="size-28 rounded-3xl"
        width={112}
        height={112}
      />
      <p className="mt-6 font-display text-3xl uppercase tracking-[0.3em] text-white">Sendero</p>
    </div>
  );
}
