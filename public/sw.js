const CACHE_NAME = 'chronomate-shell-v3';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'reload' }).then(async (res) => {
            if (res.ok) {
              await cache.put(url, res.clone());
              // Automatically extract and precache hashed JS/CSS assets discovered in index.html
              if (url === '/' || url === '/index.html') {
                try {
                  const html = await res.text();
                  const assetMatches = html.match(/\/assets\/[^"'\s>]+\.(?:js|css)/g) || [];
                  await Promise.allSettled(
                    assetMatches.map(async (assetUrl) => {
                      const assetRes = await fetch(assetUrl);
                      if (assetRes.ok) {
                        await cache.put(assetUrl, assetRes.clone());
                        await cache.put(new Request(assetUrl), assetRes);
                      }
                    })
                  );
                } catch {
                  // Ignore asset extraction failure
                }
              }
            }
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML): Network-first with offline fallback to cached '/' so new deploys update cleanly
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/', response.clone());
            await cache.put('/index.html', response.clone());
            // Precache any newly discovered bundle hashes
            try {
              const html = await response.clone().text();
              const assetMatches = html.match(/\/assets\/[^"'\s>]+\.(?:js|css)/g) || [];
              await Promise.allSettled(
                assetMatches.map(async (assetUrl) => {
                  const match = await cache.match(assetUrl);
                  if (!match) {
                    const assetRes = await fetch(assetUrl);
                    if (assetRes.ok) {
                      await cache.put(assetUrl, assetRes.clone());
                      await cache.put(new Request(assetUrl), assetRes);
                    }
                  }
                })
              );
            } catch {
              // Ignore
            }
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached =
            (await cache.match(request)) ||
            (await cache.match('/')) ||
            (await cache.match('/index.html'));
          return (
            cached ||
            new Response('Offline - ChronoMate', {
              headers: { 'Content-Type': 'text/html' },
            })
          );
        })
    );
    return;
  }

  // Hashed static assets (/assets/*): Cache-first, populating cache on first visit
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached =
          (await cache.match(request)) ||
          (await cache.match(url.pathname)) ||
          (await cache.match(request.url));
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response && response.ok) {
            await cache.put(request, response.clone());
            await cache.put(url.pathname, response.clone());
          }
          return response;
        } catch {
          // If offline and exact hash was not cached, fallback to the latest cached JS or CSS file
          const isJs = url.pathname.endsWith('.js');
          const isCss = url.pathname.endsWith('.css');
          const keys = await cache.keys();
          for (const key of keys) {
            const keyUrl = key.url;
            if (isJs && keyUrl.includes('/assets/') && keyUrl.endsWith('.js')) {
              const fallback = await cache.match(key);
              if (fallback) return fallback;
            }
            if (isCss && keyUrl.includes('/assets/') && keyUrl.endsWith('.css')) {
              const fallback = await cache.match(key);
              if (fallback) return fallback;
            }
          }
          return new Response('', { status: 408, statusText: 'Offline asset not found' });
        }
      })
    );
    return;
  }

  // Manifest and icons: Stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
