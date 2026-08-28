# Plan: app de jugador instalable + publicación de resultados

**Fecha:** 2026-08-28 · **Contexto:** la PWA actual instala siempre el modo admin
(el `start_url` del manifest descarta el hash `#ver=`). Se quiere: (1) que los
jugadores instalen una app de solo lectura que se actualice sola cuando el admin
publique resultados, y (2) que el admin publique con un botón. Sin backend: el
"tablón oficial" es un JSON estático en el propio repo servido por GitHub Pages.

**Decisión de nombre (usuario, 2026-08-28):** la app de jugador se llama
igual — "Liga Mutxo Padel" — SIN la palabra "consulta" en ningún texto visible
(ni en el nombre del manifest, ni banner "Modo consulta": la página de jugador
simplemente no tiene controles de edición y no necesita anunciarlo).

**Reglas no negociables (heredadas + nuevas):**
- El modo admin (`index.html`) sigue abriéndose con doble clic sin red. La app
  de jugador y el botón Publicar SÍ requieren red por naturaleza (excepción
  asumida: publicar y consultar lo publicado son actos online).
- Sin backend propio: solo GitHub Pages (estáticos) y la API REST de GitHub
  para publicar (Fase 2), con token del admin guardado SOLO en su dispositivo.
- Patrón `[hidden]` y `textContent` para datos de usuario, como siempre.
- **REGLA DE CACHÉ (de la Fase 6 del plan anterior): cada fase que cambie
  ficheros servidos debe SUBIR la constante `CACHE` de `sw.js`.**

**Cláusula fija de todos los contratos ("Sin background"):** corre tests/lint en
PRIMER PLANO (nunca `run_in_background`) y termina tu turno con el informe final;
prohibido terminar "esperando" a nada. Si arrancas un servidor local de pruebas,
mátalo antes de terminar y confírmalo en el informe.

**Verificación de cada fase (la hace Fable):** diff completo a mano + navegador
real. Trampas conocidas: probar enlaces/hashes en PESTAÑA NUEVA (same-document
navigation no re-ejecuta init); el portapapeles y la instalación real solo se
comprueban en móvil del usuario; `setOffline` de Playwright NO afecta al service
worker — para offline real, apagar el servidor. Tras cerrar una fase: reportar y
PARAR hasta luz verde explícita.

---

## Fase 1 — App de jugador (`jugador.html`) + `liga-oficial.json`

**Diseño cerrado (no reabrir durante la ejecución):**
- **`jugador.html`** (nueva, en la raíz): misma cabecera `<h1>Liga Mutxo Padel</h1>`
  y `style.css`; SOLO pestañas Jornadas y Clasificación (Jornadas activa
  inicial); bajo la cabecera, una línea discreta "Actualizado: <fecha>" (del
  campo `publicadoEl` del JSON si existe; si no, se omite). Sin banner de
  consulta, sin pestaña Jugadores, sin barra de ligas, sin botones de
  generar/exportar/importar/compartir. SÍ incluye: los contenedores de
  jornadas/clasificación, el modal de la ficha de jugador, los botones "Sacar
  imagen" y `vendor/html2canvas.min.js`. Carga el MISMO `app.js` (nada de
  duplicar lógica) con `<body data-pagina="jugador">`.
- **`app.js`**: en `init()`, si `document.body.dataset.pagina === 'jugador'`,
  se toma un camino propio `initJugador()` que: pone `modoConsulta = true`
  (reutilizando TODAS las salvaguardas de la Fase 4: guardarEstado no-op,
  inputs disabled, sin botón completar), NO llama a `cargarEstado()` (no toca
  la clave del admin) y llama a `cargarLigaOficial()`:
  - `fetch('liga-oficial.json', { cache: 'no-store' })` → validar con
    `formaValidaLiga` → `ligaState = normalizarLiga(estado)` → render de
    jornadas/clasificación + línea "Actualizado".
  - Los listeners de `init()` que tocan elementos inexistentes en
    `jugador.html` no deben ejecutarse (registro condicional por página o
    null-checks — elegir UNO y aplicarlo consistente).
  - Estados no felices, con mensaje amable en la propia página (no modal):
    404 → "El administrador aún no ha publicado la liga."; sin red y sin
    caché → "Sin conexión. Vuelve a intentarlo con internet."; JSON inválido
    → "La liga publicada no se ha podido leer."
- **`sw.js`**: subir a `CACHE = 'liga-mutxo-v2'`; añadir a `ARCHIVOS`:
  `jugador.html` y `manifest-jugador.json`. Añadir manejo especial para
  `liga-oficial.json`: **red primero** (y al conseguirla, actualizar la caché),
  con fallback a la copia cacheada si no hay red — así la app de jugador abre
  offline con los últimos resultados vistos. `liga-oficial.json` NO va en la
  lista de precache (puede no existir aún; se cachea en runtime).
- **`manifest-jugador.json`**: `name`/`short_name` "Liga Mutxo Padel",
  `start_url` y `scope` apuntando a `jugador.html` (scope `.` y start_url
  `jugador.html` vale), mismos colores e iconos que el manifest actual.
  `jugador.html` enlaza este manifest y el apple-touch-icon.
- **`liga-oficial.json`**: NO se crea en esta fase (lo crea el admin al
  publicar — Fase 2 — o subiéndolo a mano). Su formato es el export plano de
  siempre + campo opcional `publicadoEl` (ISO), que `formaValidaLiga` debe
  tolerar (campo extra, no requerido).
- El registro del service worker en `jugador.html` es el mismo bloque
  condicional https/localhost que en `index.html`.
- `README.md`: sección "App para jugadores" — URL de instalación
  `https://ilusiacards.github.io/liga-padel-mutxo/jugador.html`, que se
  actualiza sola al publicar el admin, y cómo subir `liga-oficial.json` a mano
  mientras no exista el botón (Fase 2).

**Contrato**
1. **Entregable:** `jugador.html` y `manifest-jugador.json` nuevos; cambios en
   `app.js`, `sw.js`, `README.md` (y `style.css` solo para la línea
   "Actualizado" y ajustes mínimos de la página de jugador).
2. **Formato:** el descrito. Sin librerías nuevas.
3. **Aceptación** (verificable; servidor local en primer plano): (a) con un
   `liga-oficial.json` de prueba servido, `jugador.html` muestra jornadas,
   clasificación, ficha de jugador al pulsar un nombre, y "Actualizado" con la
   fecha; (b) el DOM de `jugador.html` no contiene ningún input habilitado ni
   botones de edición/gestión (comprobación programática como en la Fase 4);
   (c) sin `liga-oficial.json` (404) aparece el mensaje de "aún no publicada";
   (d) el localStorage de la clave `padel-liga-mutxo-v1` queda byte a byte
   intacto tras usar `jugador.html` (aunque haya ligas del admin en ese
   navegador); (e) offline real (servidor APAGADO tras una primera visita con
   red): `jugador.html` abre y muestra la última liga vista; (f) `index.html`
   (admin) sigue funcionando igual por `file://` y por http, y `CACHE` es
   `liga-mutxo-v2`; (g) el manifest de jugador parsea y apunta a
   `jugador.html`; (h) `git diff` no toca algoritmo ni clasificación.
4. **Prohibido:** tocar el algoritmo, la clasificación, la clave de
   localStorage del admin, el formato de export/enlaces, `vendor/`, textos con
   "consulta" en la página de jugador, y `git commit`/`git push` (revisión
   primero).
5. **Sin background:** (cláusula fija de cabecera).

**Modelo:** Opus (cruza service worker, página nueva y los dos modos de app.js).
**Paralelizable:** no.

- [x] Fase 1 ejecutada
- [x] Diff revisado a mano por Fable
- [x] Verificada en navegador (criterios a–i; 19/19 del agente + verificación
      propia: carga, solo lectura, ficha, 404, clave admin intacta, sin
      "consulta" visible, admin file:// intacto)
- [ ] Desplegada en Pages y comprobada la URL pública de jugador.html

---

## Fase 2 — Botón "Publicar resultados" (admin, vía API de GitHub)

**Diseño cerrado:**
- Botón **"Publicar resultados"** en `index.html`, junto a "Compartir enlace"
  (fila `.acciones-datos`). Solo visible/útil en modo admin (nunca en modo
  consulta ni en `jugador.html`).
- Flujo al pulsarlo:
  1. Si no hay token guardado: modal de texto (reutilizar `mostrarModalTexto`
     con el input en `type="password"` para esta llamada) pidiendo el token,
     con un texto corto de qué es y un enlace en README a cómo crearlo. Se
     guarda en localStorage bajo clave propia `padel-liga-mutxo-token` (SOLO
     en el dispositivo del admin).
  2. Modal de confirmación: "Se publicará la liga activa como liga oficial,
     visible para todos los jugadores. ¿Continuar?".
  3. `GET https://api.github.com/repos/ilusiacards/liga-padel-mutxo/contents/liga-oficial.json`
     (con el token) para obtener el `sha` si el fichero ya existe (404 = se
     creará). Luego `PUT` al mismo endpoint con: `message` "Publica resultados
     — <fecha ISO>", `content` = base64 del JSON (estado plano de la liga
     activa + `publicadoEl` = ahora; base64 unicode-seguro vía
     `TextEncoder` → `btoa`, NO `btoa(JSON)` a pelo), y `sha` si existía.
  4. Feedback en el botón (como "¡Enlace copiado!"): "Publicado ✓ (visible en
     ~1 min)". Errores: 401 → borrar token guardado y avisar "Token inválido o
     caducado" (el siguiente clic lo vuelve a pedir); red u otros → aviso
     genérico con el código.
- Seguridad, documentada en README: token **fine-grained** limitado al repo
  `liga-padel-mutxo` con permiso Contents: Read and write y nada más;
  revocable desde GitHub; queda solo en el navegador del admin. El README
  explica los pasos de creación del token.
- Funciona también por `file://` (la API de GitHub permite CORS desde
  cualquier origen); el botón NO depende del modo web.
- `sw.js`: subir a `CACHE = 'liga-mutxo-v3'` (cambian index.html/app.js).
- `README.md`: sección "Publicar resultados (admin)".

**Contrato**
1. **Entregable:** cambios en `app.js`, `index.html`, `README.md`, `sw.js`
   (bump de caché) y `style.css` si hace falta.
2. **Formato:** el descrito. Sin librerías.
3. **Aceptación:** (a) sin token guardado, el botón pide token con input tipo
   password y lo persiste en su clave propia; (b) la función que construye la
   petición PUT genera base64 correcto para un estado con acentos/ñ (test con
   node: decodificar el base64 devuelve JSON idéntico con `publicadoEl`
   añadido); (c) simulación de 401 (token falso contra la API real o mock)
   borra el token y muestra el aviso; (d) el flujo GET-sha→PUT está implementado
   con los endpoints y campos exactos de la API de contents de GitHub
   (revisión por código + una publicación REAL de prueba coordinada con el
   usuario o con un token que facilite él — si no hay token disponible, la
   publicación real queda como comprobación del usuario y se dice
   explícitamente en el informe); (e) el botón no aparece en `jugador.html` ni
   hace nada en modo consulta; (f) `CACHE` es `liga-mutxo-v3`; (g) `git diff`
   no toca algoritmo/clasificación/formatos.
4. **Prohibido:** guardar el token en el repo o en el código, tocar el
   algoritmo, la clasificación, los formatos, `vendor/`, y
   `git commit`/`git push` (revisión primero).
5. **Sin background:** (cláusula fija de cabecera).

**Modelo:** Sonnet (flujo cerrado arriba; la parte delicada — token y base64 —
queda especificada). **Paralelizable:** no.

- [ ] Fase 2 ejecutada
- [ ] Diff revisado a mano por Fable
- [ ] Verificada (criterios a–g)
- [ ] Publicación real de prueba hecha (admin) y jugador.html reflejándola

---

## Cierre del plan

- [ ] Ambas fases verificadas, pusheadas y desplegadas
- [ ] Memoria del proyecto actualizada (app de jugador, flujo de publicación,
      claves nuevas de localStorage, regla de caché aplicada v2→v3)
- [ ] Retirar este doc (`git rm docs/plan-modo-jugador.md` + commit) tras
      comprobar por grep que nada lo referencia
