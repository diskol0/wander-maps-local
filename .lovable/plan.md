# Mejoras del mapa móvil y rutas incluidas

## Cambios
- Reorganizar el buscador y el selector de mapa en pantallas móviles para que nunca se solapen; conservar la disposición actual en pantallas grandes.
- Añadir a la biblioteca inicial las seis rutas indicadas con su nombre, zona, métricas y trazado real cuando Wikiloc lo permita públicamente.
- Mantener estas rutas como rutas incluidas: podrán ocultarse con la papelera igual que Ordesa y Cares, sin duplicarse en la biblioteca personal.
- Completar los metadatos sociales que falten en las páginas modificadas.

## Validación
- Comprobar la pantalla de descarga con el tamaño de un Pixel 8a y confirmar visualmente que buscador y selector son accesibles.
- Abrir las nuevas rutas, comprobar que el trazado se centra y que la descarga GPX funciona.
- Revisar la compilación automática y los errores de ejecución.

## Limitación
- Wikiloc puede exigir sesión o una suscripción para descargar ciertos GPX. No se sortearán esas restricciones; si el trazado real no es público, la app mostrará los datos públicos disponibles y requerirá el GPX autorizado para incluir la geometría exacta.
