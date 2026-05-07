// ═══════════════════════════════════════════════════
//  MagasinPro — Service Worker
//  Cache-first pour les assets, offline garanti
// ═══════════════════════════════════════════════════

const VERSION    = 'magasinpro-v1.0.0';
const CACHE_CORE = VERSION + '-core';
const CACHE_FONT = VERSION + '-fonts';

// Assets à mettre en cache dès l'installation
const CORE_ASSETS = [
  './login.html',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// ── INSTALL : mise en cache initiale ───────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_CORE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE : nettoyage des anciens caches ─────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_CORE && k !== CACHE_FONT)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH : stratégie par type de ressource ─────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. API JSONBin → toujours réseau (pas de cache)
  if (url.hostname === 'api.jsonbin.io') {
    event.respondWith(fetch(request).catch(() =>
      new Response(JSON.stringify({ error: 'offline' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // 2. Google Fonts → cache-first puis réseau
  if (FONT_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(
      caches.open(CACHE_FONT).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // 3. Assets locaux → cache-first, mise à jour en arrière-plan
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_CORE).then(cache =>
        cache.match(request).then(cached => {
          // Mise à jour silencieuse en arrière-plan
          const networkFetch = fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => null);

          // Retourner le cache immédiatement (ou attendre le réseau si pas de cache)
          return cached || networkFetch || caches.match('./login.html');
        })
      )
    );
    return;
  }

  // 4. Tout le reste → réseau avec fallback cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── MESSAGE : mise à jour forcée ────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── SYNC : notification retour en ligne ─────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client =>
          client.postMessage({ type: 'BACK_ONLINE' })
        )
      )
    );
  }
});
