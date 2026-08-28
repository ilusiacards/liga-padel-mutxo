# Liga Mutxo Padel

App web 100% estática (sin framework, sin build, sin backend) para gestionar la liga de pádel entre dos columnas de jugadores.

## Cómo abrir

Haz doble clic en `index.html` (o ábrelo desde el navegador con `Archivo > Abrir`). No necesita servidor ni instalación.

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
