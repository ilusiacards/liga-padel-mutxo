# Liga Mutxo Padel

App web 100% estática (sin framework, sin build, sin backend) para gestionar la liga de pádel entre dos columnas de jugadores.

## Cómo abrir

Haz doble clic en `index.html` (o ábrelo desde el navegador con `Archivo > Abrir`). No necesita servidor ni instalación.

## Instalar como app (PWA)

Desde la URL pública (`https://ilusiacards.github.io/liga-padel-mutxo/`), el navegador
ofrece **Añadir a pantalla de inicio** (móvil) o **Instalar** (icono en la barra de
direcciones, escritorio). Una vez instalada funciona offline tras la primera visita:
el propio navegador se encarga de guardar los ficheros de la app en caché. Los datos
de tu liga siguen viviendo solo en el navegador (`localStorage`), igual que siempre;
instalar la app no cambia dónde se guardan ni cómo se comparten.

## App para jugadores

Los jugadores no necesitan la app de gestión: tienen la suya, de solo lectura, en

[`https://ilusiacards.github.io/liga-padel-mutxo/jugador/`](https://ilusiacards.github.io/liga-padel-mutxo/jugador/)

Esa es la URL que hay que pasarles. Desde ella el navegador ofrece **Añadir a
pantalla de inicio** / **Instalar** igual que la app de gestión, y queda como una
app aparte ("Liga Mutxo Padel") con su propio ámbito de instalación (distinto
del de la app de gestión, así que las dos se pueden instalar a la vez sin que
Android confunda una con otra). El enlace antiguo,
`https://ilusiacards.github.io/liga-padel-mutxo/jugador.html`, sigue
funcionando: redirige automáticamente a `jugador/`.

Qué ven: solo las pestañas **Jornadas** y **Clasificación**, con la ficha de cada
jugador y los botones **Sacar imagen**. No hay pestaña Jugadores, ni selector de
ligas, ni botones de generar/exportar/importar/compartir, y los sets salen
deshabilitados: no pueden tocar nada.

**Se actualiza sola**: cada vez que se abre, descarga `liga-oficial.json` del
propio sitio, así que en cuanto el administrador publica una versión nueva, todos
la ven al abrir la app (no hay que reinstalar nada). Si en ese momento no hay red,
muestra la última liga que se descargó; si no se ha llegado a descargar ninguna,
avisa de que hace falta internet. Bajo el título aparece la línea
"Actualizado: …" con la fecha de la última publicación, junto al botón
**Actualizar**, que fuerza esa misma descarga al momento sin recargar la página.

### Publicar resultados (admin)

En la parte superior de la pestaña **Jornadas** de la app de gestión,
el botón **Publicar resultados** sube la liga activa como `liga-oficial.json`
a la raíz del repo — el "tablón oficial" que `jugador.html` descarga. El
contenido es exactamente el del export (`girls`, `boys`, `jornadas`,
`liveGenerated`) más un campo `publicadoEl` con la fecha y hora (ISO) de la
publicación, que alimenta la línea "Actualizado: …" de la app de jugadores.

La primera vez que lo pulses (o si el token guardado deja de servir) te pide
un **token de acceso personal de GitHub**, que se guarda solo en este
dispositivo — en el `localStorage` del navegador, nunca en el repo ni en el
código — y es el que usa la app para subir el archivo en tu nombre. Para
crear uno:

1. En GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Repository access**: *Only select repositories* → elige
   `liga-padel-mutxo`.
3. **Permissions → Repository permissions → Contents**: `Read and write`. No
   hace falta ningún otro permiso.
4. Elige la fecha de expiración que prefieras y genera el token.
5. Pégalo en el aviso que muestra la app.

Ese token es revocable en cualquier momento desde GitHub (misma pantalla,
**Personal access tokens → Fine-grained tokens**) sin que afecte a nada más
de tu cuenta, y solo puede tocar el contenido de este repo.

Al pulsar Publicar, tras confirmar, el botón pasa a "Publicando…" y termina
en "Publicado ✓ (visible en ~1 min)" si todo va bien. Un minuto después
`jugador.html` ya sirve los resultados nuevos. Si el token es inválido o ha
caducado, la app lo borra y avisa para que pegues uno nuevo la próxima vez
que pulses Publicar; sin conexión, avisa de que no se ha podido publicar.

## Cómo generar la liga

1. Ve a la pestaña **Jugadores** y escribe los 8 nombres de la Columna 1 y los 8 de la Columna 2.
2. Pulsa **Generar Liga**. Se crearán 8 jornadas con 4 partidos cada una: cada persona de la Columna 1 juega cada jornada con una de la Columna 2, sin repetir compañero.
3. Si ya existía una liga generada, se pedirá confirmación antes de borrar los resultados actuales.

## Cómo introducir resultados

En la pestaña **Jornadas**, despliega cada jornada y rellena los sets (0-7 juegos) de cada partido. Pulsa **Partido completado** para calcular el ganador (mejor de 3 sets). Puedes pulsar **Editar resultado** para corregir un partido ya completado.

## Clasificación

La pestaña **Clasificación** se recalcula automáticamente con cada resultado introducido: puntos (victoria 3, derrota 1), sets y juegos ganados/perdidos. Cuando dos o más jugadores empatan a puntos, el orden entre ellos se decide con estos criterios, en este orden:

1. Victorias en enfrentamientos directos dentro del grupo empatado (mini-liga: cuenta cuántos de esos partidos ganó cada jugador contra otros del mismo grupo).
2. Diferencia de sets (ganados - perdidos) de toda la liga.
3. Diferencia de juegos (ganados - perdidos) de toda la liga.
4. Orden alfabético.

## Sacar imagen (compartir por WhatsApp o email)

- En la pestaña **Jornadas**, cada jornada tiene un botón **Sacar imagen** que genera una foto (PNG) de esa jornada con todos sus partidos y resultados.
- En la pestaña **Clasificación**, el botón **Sacar imagen** genera una foto de la tabla completa.
- Al pulsarlo se descarga el archivo PNG (el navegador pedirá dónde guardarlo, según su configuración). Desde ahí puedes adjuntarlo en WhatsApp, email, etc.

## Varias ligas

Debajo del título hay un **selector de liga** con las ligas guardadas y tres botones:

- **Nueva**: pide un nombre (por defecto "Liga N") y crea una liga vacía, que queda activa.
- **Renombrar**: cambia el nombre de la liga activa.
- **Eliminar**: borra la liga activa previa confirmación. Siempre tiene que quedar al menos una liga, así que el botón se deshabilita cuando solo hay una.

Cambiar de liga en el selector cambia al instante todas las pestañas (Jugadores, Jornadas y Clasificación): cada liga guarda sus propios jugadores, jornadas y resultados, y la app recuerda cuál estaba activa al recargar.

Todas las ligas viven **solo en este navegador** (`localStorage`, clave `padel-liga-mutxo-v1`): no se sube nada a ningún servidor y no se sincronizan entre dispositivos. Para eso están el export/import y el enlace compartible, que llevan **solo la liga activa** — al importar un archivo o abrir un enlace, esa liga se añade como una liga nueva a la lista y no sustituye a ninguna de las que ya tienes.

## Exportar / Importar (compartir entre dispositivos)

- **Exportar Datos**: descarga un archivo `liga-padel-mutxo-{fecha}.json` con todo el estado de la liga activa.
- **Importar Datos**: en otro dispositivo o navegador, usa este botón para cargar el archivo exportado. Se pedirá confirmación y la liga del archivo se añadirá como una liga nueva (toma el nombre del archivo).

## Compartir por enlace

El botón **Compartir enlace** (junto a Exportar/Importar Datos) abre un pequeño
modal para elegir qué tipo de enlace generar. En ambos casos la liga completa
viaja comprimida en el propio enlace (nada se sube a ningún servidor) y la URL
se copia al portapapeles; el botón muestra brevemente "¡Enlace copiado!" como
confirmación.

- **Solo lectura (para el grupo)**: genera un enlace de **modo consulta**
  (`#ver=...`). Quien lo abre puede ver las pestañas **Jornadas** y
  **Clasificación** de esa liga, colapsar/expandir jornadas y usar "Sacar
  imagen", pero no puede editar nada: no hay pestaña Jugadores, no hay
  selector de ligas ni botones de Generar/Exportar/Importar/Compartir, y los
  sets de los partidos aparecen deshabilitados. La liga del enlace se carga
  solo en memoria — **no se guarda** en el navegador de quien lo abre, así que
  sus propias ligas (si tiene) quedan completamente intactas. Recargar la
  página o reenviar la misma URL sigue funcionando, porque el enlace no se
  "consume": es este el pensado para compartir con todo el grupo.
- **Copia completa (editable)**: genera el enlace de siempre (`#liga=...`).
  Quien lo abre puede importar esa liga como una liga nueva y editarla con
  total libertad, sin afectar a la del que comparte. Es una copia
  independiente, pensada para un único destinatario que vaya a llevar su
  propia versión de la liga.

Ambos tipos de enlace:

- Requieren la versión web publicada en
  [`https://ilusiacards.github.io/liga-padel-mutxo/`](https://ilusiacards.github.io/liga-padel-mutxo/):
  si abres `index.html` con doble clic (`file://`), el botón avisa de que hace falta
  esa versión web, porque un enlace `file://` no se puede compartir ni abrir en otro
  dispositivo.
- Contienen **solo la liga activa** en el momento de generarlos.
- Un enlace corrupto o inválido (de cualquiera de los dos tipos) muestra un aviso
  y no rompe nada: la app se queda en su estado normal.

Al abrir un enlace `#liga=` (copia completa), la app pregunta si quieres
importar esa liga; al aceptar se añade como una liga nueva ("Liga importada")
y no sustituye a ninguna de las que ya tengas en ese navegador. Un enlace
`#ver=` (solo lectura) no pregunta nada: entra directamente en modo consulta.

## Ficha de jugador

En la pestaña **Clasificación**, el nombre de cada jugador es clicable: al pulsarlo se abre su **ficha**, con:

- **Cabecera**: nombre y posición actual en la clasificación.
- **Resumen**: PJ, PG, PP, sets y juegos a favor/en contra y puntos — los mismos números que su fila de la tabla.
- **Historial de partidos**: solo los completados, ordenados por jornada, con el compañero de ese partido, la pareja rival, el marcador por sets y si lo ganó o lo perdió.
- **Pendientes**: con quién aún no ha jugado como pareja y contra quién aún no se ha enfrentado como rival, recorriendo todo el calendario generado (jugado o no). Si ya coincidió con todo el mundo, se muestra "Nadie pendiente".
- **Evolución de posición**: la posición en la clasificación acumulada jornada a jornada (solo las jornadas con algún partido ya completado), en formato compacto ("J1: 3º · J2: 2º · …").

La ficha es solo de consulta (no cambia ningún resultado ni guarda nada) y funciona igual en modo consulta (`#ver=`). Tiene su propio botón **Sacar imagen** para descargarla como PNG. Se cierra con el botón **Cerrar** o pulsando fuera del cuadro.

## Reiniciar desde cero

Todas las ligas se guardan en `localStorage` bajo la clave `padel-liga-mutxo-v1`. Para borrar **todas** y empezar de nuevo, abre las herramientas de desarrollador del navegador (F12), ve a la pestaña Aplicación/Storage, y elimina esa clave de `localStorage` — o ejecuta en la consola:

```js
localStorage.removeItem('padel-liga-mutxo-v1');
```

Luego recarga la página.

## Extensión futura: modo "parejas fijas" (no implementado)

El modo actual forma la pareja de cada jugador de nuevo en cada jornada (sin
repetir compañero). Un hipotético modo alternativo de "parejas fijas" —donde
la pareja se decide una única vez y se mantiene toda la liga— necesitaría, al
menos: (1) un paso previo de emparejamiento persona-a-persona entre columna 1
y columna 2 antes de generar el calendario; (2) un generador de calendario
distinto, tipo round-robin directo entre las parejas ya formadas (en vez de
entre personas de columnas separadas); y (3) una clasificación calculada por
pareja en vez de por persona. No hay código de este modo en la app; queda
anotado aquí como referencia si se decide implementarlo más adelante.
