import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ url: z.string().url() });

/**
 * Fetches a GPX file from a public URL on the server, so the browser is not
 * blocked by cross-origin rules.
 */
export const fetchRemoteGpx = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }) => {
    const res = await fetch(data.url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "application/gpx+xml,application/xml,text/xml,*/*",
      },
    });

    if (!res.ok) {
      return { ok: false as const, error: `El sitio respondió ${res.status}.` };
    }

    const text = await res.text();
    if (!text.includes("<gpx")) {
      return {
        ok: false as const,
        error: "Ese enlace no devuelve un archivo GPX directo.",
      };
    }

    return { ok: true as const, xml: text };
  });
