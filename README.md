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

## Exportar / Importar (compartir entre dispositivos)

- **Exportar Datos**: descarga un archivo `liga-padel-mutxo-{fecha}.json` con todo el estado de la liga.
- **Importar Datos**: en otro dispositivo o navegador, usa este botón para cargar el archivo exportado y continuar con los mismos datos. Se pedirá confirmación antes de sobrescribir los datos actuales.

## Compartir por enlace

- El botón **Compartir enlace** (junto a Exportar/Importar Datos) genera una URL que
  contiene la liga completa comprimida en el propio enlace (nada se sube a ningún
  servidor) y la copia al portapapeles; el botón muestra brevemente "¡Enlace
  copiado!" como confirmación.
- Requiere la versión web publicada en
  [`https://ilusiacards.github.io/liga-padel-mutxo/`](https://ilusiacards.github.io/liga-padel-mutxo/):
  si abres `index.html` con doble clic (`file://`), el botón avisa de que hace falta
  esa versión web, porque un enlace `file://` no se puede compartir ni abrir en otro
  dispositivo.
- Al abrir un enlace compartido, la app pregunta si quieres importar esa liga (te
  pedirá confirmación porque sustituye a la liga que tengas cargada en ese momento).

## Reiniciar desde cero

Los datos se guardan en `localStorage` bajo la clave `padel-liga-mutxo-v1`. Para borrar todo y empezar de nuevo, abre las herramientas de desarrollador del navegador (F12), ve a la pestaña Aplicación/Storage, y elimina esa clave de `localStorage` — o ejecuta en la consola:

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
