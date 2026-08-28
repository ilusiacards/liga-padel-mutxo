// Service worker de Liga Mutxo Padel: cache-first con lista explícita de
// estáticos para poder abrir la app offline tras la primera visita.
//
// IMPORTANTE: al desplegar cambios en index.html/app.js/style.css/etc,
// subir la versión de CACHE de abajo para que el navegador descarte la
// caché vieja y sirva los ficheros nuevos.
const CACHE = 'liga-mutxo-v1';

const ARCHIVOS = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'vendor/html2canvas.min.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

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
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((respuestaCache) => {
      if (respuestaCache) return respuestaCache;
      return fetch(request);
    })
  );
});
