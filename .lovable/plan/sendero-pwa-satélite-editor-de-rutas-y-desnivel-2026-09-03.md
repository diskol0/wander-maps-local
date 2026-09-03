# Sendero: PWA, satélite, editor de rutas y desnivel

## Qué cambia

**1. App instalable y offline completo (PWA)**
- Manifiesto, iconos y colores de marca para instalar Sendero en el móvil.
- Service worker que cachea la app entera, para que se abra desde el icono sin cobertura.
- No se registra en la vista previa de Lovable (solo en la app publicada), para evitar pantallas en blanco por caché antigua.

**2. Descarga de zona: callejero + satélite + altitudes**
- Cada descarga guarda siempre las dos capas: callejero (OpenStreetMap) y satélite (Esri World Imagery).
- Además se guarda una malla de altitudes de la zona, para poder calcular desniveles sin conexión en cualquier punto.
- La estimación de tamaño y la barra de progreso reflejan las dos capas; el listado de zonas guardadas muestra el peso real.
- Las zonas ya descargadas antes solo tienen callejero: se marcan como "incompleta" con un botón para completar satélite y altitudes.

**3. Selector de vista en todos los mapas**
- Control flotante "Callejero / Satélite" en el mapa de detalle de ruta, en el mapa online y en el editor.
- La preferencia se recuerda entre pantallas.
- Sin conexión solo se pintan las teselas guardadas; si falta una capa se avisa en pantalla.

**4. Abrir una zona descargada y crear rutas encima**
- Nueva pantalla "Mis mapas": lista de zonas descargadas; al elegir una se abre en modo offline centrada en esa zona.
- Editor de ruta: clic para añadir puntos, arrastrar para mover, deshacer, borrar el último y limpiar todo. Los puntos se unen con segmentos rectos.
- A cada punto se le asigna su altitud desde la malla descargada; se calcula distancia, desnivel positivo y negativo en vivo.
- Guardar la ruta con nombre, actividad y dificultad. Se almacena en el dispositivo y aparece junto a las rutas de ejemplo en "Mis rutas", con su ficha de detalle, perfil de elevación y descarga de GPX.

**5. Desnivel entre dos puntos**
- En la ficha de una ruta y en el editor: seleccionas dos puntos y se muestra distancia entre ellos, diferencia de cota, desnivel acumulado + y −, y pendiente media.
- Los puntos se eligen tocando el mapa o el perfil de elevación; el tramo se resalta en ambos.

## Detalles técnicos

- Teselas: se amplía `src/lib/tile-cache.ts` con clave por capa (`street` / `sat`), URLs de OSM y Esri World Imagery, y descarga por capas con el mismo control de concurrencia y progreso. `Region` pasa a guardar `layers` y bytes por capa (migración tolerante para regiones antiguas).
- Altitudes: nuevo `src/lib/elevation.ts`. Al descargar la zona se pide una malla (paso ~90 m, troceada en lotes) a la API pública de elevación de Open-Meteo y se guarda en IndexedDB; consulta offline con interpolación bilineal. Si la descarga de altitudes falla, la zona queda usable como mapa y se puede reintentar.
- `LeafletMap.tsx`: soporte de capa activa mediante prop, capa cacheada por `layer`, y modos `view` / `draw` con handlers de clic y marcadores arrastrables.
- Rutas guardadas: `src/lib/my-trails.ts` en IndexedDB, mismo tipo `Trail`, integrado en la biblioteca y en `ruta.$trailId`.
- Nuevas rutas: `src/routes/mapas.tsx` (zonas descargadas) y `src/routes/mapas.$regionId.editor.tsx` (editor), cada una con su `head()`.
- PWA con `vite-plugin-pwa` (`generateSW`, `registerType: autoUpdate`), registro solo desde un wrapper con guardas de preview/iframe/dev y `?sw=off`; navegaciones `NetworkFirst`. Las teselas y altitudes siguen en IndexedDB, no en el service worker.

## Notas

- El satélite duplica aproximadamente el peso de cada zona; se avisa del tamaño estimado antes de descargar.
- El modo offline real (abrir sin cobertura desde el icono) solo se puede comprobar en la app publicada, no en la vista previa.
