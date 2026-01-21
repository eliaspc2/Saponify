// Service Worker para Saponify PWA
const CACHE_NAME = 'saponify-v2';
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/assets/brand/logo.png'
];

// Instalacao - cachear recursos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

// Ativacao - limpar caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames.map((cacheName) => {
                if (cacheName !== CACHE_NAME) {
                    return caches.delete(cacheName);
                }
            })
        ))
    );
    self.clients.claim();
});

// Fetch - estrategia Network First com fallback para Cache
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// Sincronizacao em background para backup automatico
self.addEventListener('sync', (event) => {
    if (event.tag === 'auto-backup') {
        event.waitUntil(performAutoBackup());
    }
});

async function performAutoBackup() {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({
            type: 'AUTO_BACKUP_TRIGGER'
        });
    });
}
