# Plan: columnas sin género + compartir por enlace + multi-liga + ficha + PWA

**Fecha:** 2026-08-28 · **Modalidad decidida:** exactamente el funcionamiento
actual — dos columnas de N personas cada una; cada jornada, cada persona de la
columna 1 forma pareja con una de la columna 2 sin repetir compañero en toda la
liga, con el criterio de cobertura de rivales intacto. Lo ÚNICO que desaparece es
la semántica de género: las columnas pasan a llamarse "Columna 1" y "Columna 2" y
quién va en cada una es indiferente. **El algoritmo NO se toca.** La clasificación
sigue siendo por persona. Queda anotado (no implementado) el modo futuro de
"parejas fijas", y la app soporta varias ligas a la vez (Fase 3), todo 100% offline.

**Decisión de datos:** al no cambiar el modelo, NO hay migración: las claves
internas del estado y del JSON (`girls`/`boys`, `girlIdx`/`boyIdx`) y la clave de
`localStorage` `padel-liga-mutxo-v1` se quedan tal cual — mismo criterio que cuando
se renombró la app sin tocar la clave ni los nombres de archivo. Solo cambian los
textos visibles. Los datos actuales y los JSON ya exportados siguen funcionando.

**Reglas no negociables (de blueprint + esta sesión):**
- La app sigue abriéndose con doble clic, sin servidor, sin dependencias de red ni
  frameworks. Todo vendorizado.
- Sin backend de ningún tipo (nada de Supabase): los datos viven en `localStorage`;
  compartir es por export/import y por enlace (Fase 2).
- Patrón `[hidden]`: todo elemento nuevo oculto con el atributo `hidden` cuya clase/id
  fije `display` lleva su par `selector[hidden]{display:none}` junto a la regla base.
- Input de usuario al DOM siempre con `textContent`, nunca `innerHTML`.

**Cláusula fija de todos los contratos ("Sin background"):** corre tests/lint en
PRIMER PLANO (nunca `run_in_background`) y termina tu turno con el informe final;
prohibido terminar "esperando" a nada.

**Verificación de cada fase (la hace Fable, no el agente):** revisión del diff completo
a mano + prueba en navegador real con gstack `browse` (si falla "Executable doesn't
exist": `export PATH="$HOME/.bun/bin:$PATH"` y
`npx playwright-core@1.58.1 install chromium-headless-shell`). Tras cerrar una fase:
reportar y PARAR hasta luz verde explícita.

---

## Fase 1 — Neutralizar el género en la UI (solo textos visibles)

El modelo interno, el algoritmo y la persistencia NO cambian. Solo desaparece la
semántica chicas/chicos de todo lo que ve el usuario.

**Diseño cerrado (no reabrir durante la ejecución):**
- Textos visibles: las cabeceras de las dos columnas de la pestaña Jugadores pasan
  de "Chicas"/"Chicos" a "Columna 1"/"Columna 2"; se revisa TODO texto visible de
  `index.html`, `app.js` (mensajes, validaciones, modal) y `README.md` que mencione
  chicas/chicos/mixto/género y se reescribe en neutro ("cada persona de la Columna 1
  juega cada jornada con una de la Columna 2, sin repetir compañero").
- Nombres internos intactos: `girls`/`boys`, `girlIdx`/`boyIdx`, ids `g<idx>`/
  `b<idx>`, la clave `padel-liga-mutxo-v1` y el formato de export NO se tocan
  (compatibilidad total con datos y JSON existentes). Se añade un comentario en
  `app.js` junto a `estadoInicial()` dejando constancia de que los nombres internos
  son legado del modelo mixto original.
- Nota de extensión futura en `README.md` (y comentario junto a
  `generarCalendario`): qué habría que añadir para un hipotético modo de "parejas
  fijas" (round-robin entre parejas preformadas). Solo anotación, cero código.
- `liga-demo.json`: se conserva tal cual (los nombres de ejemplo valen); solo se
  regenera si algún texto del propio JSON mostrara géneros en la UI (no es el caso
  esperado).

**Contrato**
1. **Entregable:** `app.js`, `index.html`, `README.md` (y `style.css` solo si algún
   selector dependiera de textos) en `liga-padel-mutxo/`.
2. **Formato:** el descrito en "Diseño cerrado". Sin librerías nuevas.
3. **Aceptación:** (a) con `browse`, en ninguna pestaña ni modal aparece
   "chica/chico/chicas/chicos/mixta/mixto" (búsqueda de texto en el DOM renderizado
   con liga generada y con liga vacía); (b) un JSON exportado ANTES del cambio
   importa sin error y muestra la misma clasificación; (c) el estado previo de
   `localStorage` carga tal cual (no se pide regenerar nada); (d) generar una liga
   de 8+8 sigue produciendo el mismo tipo de calendario que antes del cambio;
   (e) `git diff` no toca ninguna función del algoritmo (solo textos, comentarios y
   README).
4. **Prohibido:** tocar el algoritmo de calendario, los nombres internos del estado,
   la clave de localStorage, el formato de export/import, `vendor/`, y el nombre
   visible de la app ("Liga Mutxo Padel").
5. **Sin background:** (cláusula fija de cabecera).

**Modelo:** Sonnet (ejecución acotada, cero decisiones abiertas).
**Paralelizable:** no (comparte ficheros con las demás fases).

- [x] Fase 1 ejecutada
- [x] Diff revisado a mano por Fable
- [x] Verificada en navegador (criterios a–e)

---

## Fase 2 — Compartir liga por enlace (sin servidor)

Botón "Compartir enlace" que genera una URL con el estado comprimido en el fragmento;
abrirla en otro dispositivo ofrece importar esa liga. Requiere la app servida en
GitHub Pages (un enlace `file://` no viaja); el doble clic local sigue funcionando —
en `file://` el botón muestra el aviso de que el enlace necesita la versión web.

**Diseño cerrado:**
- Compresión con `CompressionStream('deflate-raw')` nativo (sin dependencias) →
  base64url. URL: `https://ilusiacards.github.io/liga-padel-mutxo/#liga=<datos>`.
- Al cargar la página con `#liga=`: modal de confirmación "¿Importar la liga del
  enlace? Sustituirá a la actual" (reutiliza `mostrarModal`); aceptar importa (misma
  validación que importar JSON) y limpia el hash; cancelar solo limpia el hash.
- El botón copia la URL al portapapeles (`navigator.clipboard`) y confirma visualmente.
- Si `CompressionStream` no existe (navegador muy viejo): aviso, no se genera enlace.
- **Tarea previa manual (usuario o Fable con `gh`):** activar GitHub Pages del repo
  `ilusiacards/liga-padel-mutxo` sirviendo la raíz de `main`.

**Contrato**
1. **Entregable:** cambios en `app.js`, `index.html`, `style.css`; `README.md` con
   sección "Compartir por enlace".
2. **Formato:** el descrito. Sin librerías.
3. **Aceptación:** con `browse` sobre servidor local: (a) generar enlace de una liga
   con resultados, abrirlo en contexto limpio y aceptar → la liga importada es
   idéntica (comparar JSON exportado); (b) cancelar no toca el estado; (c) un
   `#liga=` corrupto muestra error y no rompe; (d) en `file://` el botón avisa en vez
   de generar enlace roto.
4. **Prohibido:** tocar el algoritmo de calendario y la clasificación; cualquier
   petición de red.
5. **Sin background:** (cláusula fija).

**Modelo:** Sonnet (diseño ya cerrado, ejecución acotada). **Paralelizable:** no
(comparte `app.js`/`index.html` con las demás).

- [x] GitHub Pages activado y comprobado (la URL pública carga la app) — repo hecho
      público (decisión del usuario 2026-08-28); https://ilusiacards.github.io/liga-padel-mutxo/ responde 200
- [x] Fase 2 ejecutada
- [x] Diff revisado a mano por Fable
- [x] Verificada en navegador (criterios a–d; el portapapeles no es verificable en
      headless — NotAllowedError por permisos, pendiente de comprobar en móvil real)

---

## Fase 3 — Varias ligas a la vez (100% offline)

Varias ligas conviven en el mismo navegador (p. ej. la de otoño en marcha y la de
primavera archivada, o dos grupos distintos). Todo offline: `localStorage` guarda
todas (pocos KB por liga frente a ~5 MB de cuota). Lo que NO da el offline es
compartir una liga "viva" entre dispositivos — para pasar el estado están el
export/import y el enlace de la Fase 2.

**Diseño cerrado:**
- La clave `padel-liga-mutxo-v1` (sin cambiar de nombre) pasa a guardar
  `{ ligas: [{ id, nombre, creadaEl, liga: <estado actual> }], activaId }`.
  Al cargar, si el valor guardado tiene la forma "plana" actual (`girls`/`boys` en
  la raíz), se envuelve automáticamente como única liga ("Liga 1") — migración
  interna silenciosa, sin perder nada. El formato de export de UNA liga no cambia.
- UI: selector en la cabecera junto al título — desplegable con las ligas + acciones
  "Nueva liga", "Renombrar", "Eliminar" (eliminar con modal de confirmación; no se
  puede eliminar la única liga). Todo lo demás (pestañas, export/import, enlace)
  opera siempre sobre la liga activa.
- El JSON exportado y el enlace de Fase 2 siguen conteniendo UNA liga (la activa);
  importar (archivo o enlace) crea una liga nueva en la lista en vez de sobrescribir.

**Contrato**
1. **Entregable:** cambios en `app.js`, `index.html`, `style.css`; `README.md`.
2. **Formato:** el descrito. Sin librerías.
3. **Aceptación:** con `browse`: (a) un estado de Fase 1 preexistente en localStorage
   aparece como "Liga 1" con sus datos íntegros; (b) crear una segunda liga, meterle
   jugadores y cambiar entre ambas conserva cada estado; (c) eliminar pide
   confirmación y respeta el mínimo de 1; (d) importar JSON o enlace crea liga nueva
   sin tocar la activa; (e) recargar la página mantiene la liga activa seleccionada.
4. **Prohibido:** cambiar el formato de export de una liga individual (rompería la
   Fase 2); tocar el algoritmo.
5. **Sin background:** (cláusula fija).

**Modelo:** Opus (toca la capa de persistencia y todos los caminos de render).
**Paralelizable:** no.

- [x] Fase 3 ejecutada
- [x] Diff revisado a mano por Fable
- [x] Verificada en navegador (criterios a–e; migración comprobada con estado
      plano real sembrado, capturas escritorio y 390px revisadas)

---

## Fase 4 — Enlaces de solo lectura (añadida 2026-08-28)

Decisión del usuario tras probar el enlace de la Fase 2: cada receptor obtiene una
copia editable, y solo la del admin "vale". Para el grupo se comparte un enlace de
**solo consulta**. Es una barrera de usabilidad, no de seguridad (sigue sin haber
backend): evita ediciones accidentales, no ediciones malintencionadas.

**Diseño cerrado:**
- El botón "Compartir enlace" pasa a abrir un modal con dos opciones:
  **"Solo lectura (para el grupo)"** genera `#ver=<datos>` y **"Copia completa
  (editable)"** genera el `#liga=<datos>` actual de la Fase 2. Misma compresión y
  payload en ambos; solo cambia el prefijo del hash.
- Al cargar con `#ver=`: la app entra en **modo consulta** sin tocar el estado
  guardado — la liga del enlace se carga en memoria, NO se guarda en localStorage,
  NO crea liga en la lista, y el hash NO se limpia (así el receptor puede recargar
  o reenviar la URL y sigue funcionando).
- En modo consulta: banner fijo visible "Modo consulta — liga compartida por
  enlace" bajo la cabecera; solo se muestran las pestañas Jornadas y Clasificación
  (Jugadores y el selector/acciones de ligas ocultos); TODOS los caminos de
  edición desactivados: inputs de sets deshabilitados (o valores como texto),
  sin botón "Partido completado", sin Generar/Exportar/Importar/Compartir ni
  gestión de ligas. Colapsar jornadas y "Sacar imagen" SÍ siguen activos (son de
  consulta). Un hash `#ver=` corrupto muestra el mismo error que la Fase 2 y cae
  a la app normal.
- Patrón `[hidden]` obligatorio para el banner/elementos nuevos; `textContent`
  para todo dato de usuario.
- `README.md`: actualizar la sección "Compartir por enlace" con los dos tipos.

**Contrato**
1. **Entregable:** cambios en `app.js`, `index.html`, `style.css`, `README.md`.
2. **Formato:** el descrito. Sin librerías.
3. **Aceptación:** con `browse` y servidor local: (a) generar enlace `#ver=` de una
   liga con resultados y abrirlo en pestaña limpia muestra jornadas y clasificación
   correctas con el banner de modo consulta; (b) en modo consulta el DOM no
   contiene ningún input editable habilitado ni botones de
   generar/exportar/importar/compartir/gestión de ligas (comprobación programática
   sobre el DOM); (c) recargar la página en modo consulta mantiene la vista;
   (d) el localStorage del receptor queda EXACTAMENTE igual que antes de abrir el
   enlace; (e) el enlace `#liga=` de la Fase 2 sigue funcionando igual;
   (f) `#ver=` corrupto → error y app normal utilizable; (g) "Sacar imagen"
   funciona en modo consulta; (h) `git diff` no toca algoritmo ni clasificación.
4. **Prohibido:** tocar el algoritmo, la clasificación, el formato de los payloads
   comprimidos, la clave de localStorage, `vendor/`; `git commit`/`git push`.
5. **Sin background:** (cláusula fija).

**Modelo:** Sonnet (diseño cerrado; ojo en revisión a caminos de edición que se
escapen). **Paralelizable:** no.

- [ ] Fase 4 ejecutada
- [ ] Diff revisado a mano por Fable (checklist de TODOS los controles de edición)
- [ ] Verificada en navegador (criterios a–h)

---

## Fase 5 — Ficha por jugador

**Diseño cerrado:**
- Pulsar el nombre de un jugador en la clasificación abre un modal-ficha con:
  resumen (PJ/PG/PP, sets y juegos a favor/en contra, puntos, posición actual),
  historial de partidos (jornada, compañero, pareja rival, marcador,
  ganado/perdido), compañeros ya habidos y rivales pendientes (sale directo de los
  contadores del algoritmo), y evolución de posición por jornada
  ("J1: 3º · J2: 2º…" o barras CSS simples — sin librerías de gráficos).
- Modal nuevo con atributo `hidden` → obligatorio el par `[hidden]{display:none}`.
- Botón "Sacar imagen" también en la ficha (reutiliza `capturarImagen`).

**Contrato**
1. **Entregable:** cambios en `app.js`, `index.html`, `style.css`.
2. **Formato:** el descrito. Sin librerías.
3. **Aceptación:** con `browse` e importando `liga-demo.json`: (a) cada jugador de la
   clasificación abre su ficha con datos que cuadran con la tabla; (b) la evolución
   de posición coincide con recalcular la clasificación jornada a jornada en al menos
   un caso comprobado a mano; (c) el modal cierra bien (botón y clic fuera) y el par
   `[hidden]` está en `style.css`; (d) "Sacar imagen" de la ficha produce PNG legible.
4. **Prohibido:** cambiar el cálculo de la clasificación existente; tocar persistencia.
5. **Sin background:** (cláusula fija).

**Modelo:** Sonnet. **Paralelizable:** no (comparte los 3 ficheros).

- [ ] Fase 5 ejecutada
- [ ] Diff revisado a mano por Fable (incluye inspección del PNG real)
- [ ] Verificada en navegador (criterios a–d)

---

## Fase 6 — PWA instalable (sin backend)

**Diseño cerrado:**
- `manifest.json` (nombre "Liga Mutxo Padel", display standalone, theme `#0a0e1a`),
  iconos 192/512 (PNG generados simples con la inicial/paleta de la app, en
  `icons/`), `sw.js` cache-first con lista explícita de ficheros y versión de caché
  (bump manual al desplegar cambios).
- Registro del service worker condicional: solo si `location.protocol` es https —
  en `file://` (doble clic) no se registra y todo sigue como hoy.
- Sin push, sin sync en segundo plano, sin Supabase: la PWA solo instala icono y
  cachea los estáticos para funcionar offline.

**Contrato**
1. **Entregable:** `manifest.json`, `sw.js`, `icons/icon-192.png`,
   `icons/icon-512.png`, enlaces en `index.html`, registro en `app.js`, `README.md`.
2. **Formato:** el descrito.
3. **Aceptación:** (a) `index.html` por doble clic (`file://`) funciona exactamente
   igual y la consola no muestra errores de SW; (b) servida por https/localhost, la
   app pasa la auditoría de instalabilidad (manifest válido + SW registrado) y carga
   offline tras la primera visita; (c) los iconos existen y pesan < 50 KB cada uno.
4. **Prohibido:** tocar la lógica de la app más allá del registro del SW; cachear
   `localStorage` o interferir en export/import.
5. **Sin background:** (cláusula fija).

**Modelo:** Sonnet. **Paralelizable:** en principio no (toca `index.html`/`app.js`);
se ejecuta la última.

- [ ] Fase 6 ejecutada
- [ ] Diff revisado a mano por Fable
- [ ] Verificada (criterios a–c) y desplegada en GitHub Pages

---

## Cierre del plan

- [ ] Todas las fases verificadas y pusheadas
- [ ] Memoria del proyecto actualizada (modelo v2 individual, campo `modo` reservado,
      migración v1, decisiones de este plan)
- [ ] Retirar este doc (`git rm docs/plan-liga-parejas.md` + commit) tras comprobar
      por grep que nada lo referencia
