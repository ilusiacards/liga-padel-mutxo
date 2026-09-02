// Service worker de Liga Mutxo Padel: cache-first con lista explícita de
// estáticos para poder abrir la app offline tras la primera visita.
//
// IMPORTANTE: al desplegar cambios en index.html/app.js/style.css/etc,
// subir la versión de CACHE de abajo para que el navegador descarte la
// caché vieja y sirva los ficheros nuevos.
const CACHE = 'liga-mutxo-v8';

const ARCHIVOS = [
  '.',
  'index.html',
  'jugador.html',
  'jugador/',
  'jugador/index.html',
  'jugador/manifest.json',
  'style.css',
  'app.js',
  'vendor/html2canvas.min.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// La liga publicada NO va en ARCHIVOS: puede no existir todavía (el precache
// entero fallaría) y además cambia cada vez que el admin publica. Se cachea
// en tiempo de ejecución con estrategia de red primero (ver el fetch).
const LIGA_OFICIAL = 'liga-oficial.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET y solo mismo origen: todo lo demás (otros orígenes, POST, etc.)
  // pasa de largo sin que el service worker lo toque.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Liga publicada: RED PRIMERO. Si hay red, se devuelve lo recién publicado
  // y de paso se refresca la copia cacheada; si no la hay, se sirve esa copia
  // para que la app de jugador siga abriendo con los últimos resultados
  // vistos. Sin copia y sin red, se deja fallar (la página lo cuenta).
  if (url.pathname.endsWith(LIGA_OFICIAL)) {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copia));
          }
          return respuesta;
        })
        .catch(() =>
          caches.match(request).then((respuestaCache) => {
            if (respuestaCache) return respuestaCache;
            throw new Error('Sin red y sin copia cacheada de la liga publicada');
          })
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((respuestaCache) => {
      if (respuestaCache) return respuestaCache;
      return fetch(request);
    })
  );
});
