# Liga Mutxo Padel

App web 100% estática (sin framework, sin build, sin backend) para gestionar la liga de pádel mixto entre "Mutxo Girls" y "Mutxo Boys".

## Cómo abrir

Haz doble clic en `index.html` (o ábrelo desde el navegador con `Archivo > Abrir`). No necesita servidor ni instalación.

## Cómo generar la liga

1. Ve a la pestaña **Jugadores** y escribe los 8 nombres de "Mutxo Girls" y los 8 de "Mutxo Boys".
2. Pulsa **Generar Liga**. Se crearán 8 jornadas con 4 partidos cada una, donde cada chica juega exactamente una vez con cada chico.
3. Si ya existía una liga generada, se pedirá confirmación antes de borrar los resultados actuales.

## Cómo introducir resultados

En la pestaña **Jornadas**, despliega cada jornada y rellena los sets (0-7 juegos) de cada partido. Pulsa **Partido completado** para calcular el ganador (mejor de 3 sets). Puedes pulsar **Editar resultado** para corregir un partido ya completado.

## Clasificación

La pestaña **Clasificación** se recalcula automáticamente con cada resultado introducido: puntos (victoria 3, derrota 1), sets y juegos ganados/perdidos, con desempate por enfrentamiento directo y, en última instancia, alfabético.

## Sacar imagen (compartir por WhatsApp o email)

- En la pestaña **Jornadas**, cada jornada tiene un botón **Sacar imagen** que genera una foto (PNG) de esa jornada con todos sus partidos y resultados.
- En la pestaña **Clasificación**, el botón **Sacar imagen** genera una foto de la tabla completa.
- Al pulsarlo se descarga el archivo PNG (el navegador pedirá dónde guardarlo, según su configuración). Desde ahí puedes adjuntarlo en WhatsApp, email, etc.

## Exportar / Importar (compartir entre dispositivos)

- **Exportar Datos**: descarga un archivo `liga-padel-mutxo-{fecha}.json` con todo el estado de la liga.
- **Importar Datos**: en otro dispositivo o navegador, usa este botón para cargar el archivo exportado y continuar con los mismos datos. Se pedirá confirmación antes de sobrescribir los datos actuales.

## Reiniciar desde cero

Los datos se guardan en `localStorage` bajo la clave `padel-liga-mutxo-v1`. Para borrar todo y empezar de nuevo, abre las herramientas de desarrollador del navegador (F12), ve a la pestaña Aplicación/Storage, y elimina esa clave de `localStorage` — o ejecuta en la consola:

```js
localStorage.removeItem('padel-liga-mutxo-v1');
```

Luego recarga la página.
