// Service Worker para Saponify PWA
const CACHE_NAME = 'saponify-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/app/frontend/index.css',
    '/app/frontend/app.js'
];

// Instalação - cachear recursos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache aberto');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// Ativação - limpar caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Removendo cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch - estratégia Network First com fallback para Cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Se a resposta for válida, cachear
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return response;
            })
            .catch(() => {
                // Se falhar (offline), tentar do cache
                return caches.match(event.request);
            })
    );
});

// Sincronização em background para backup automático
self.addEventListener('sync', (event) => {
    if (event.tag === 'auto-backup') {
        event.waitUntil(performAutoBackup());
    }
});

async function performAutoBackup() {
    // Trigger backup automático
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({
            type: 'AUTO_BACKUP_TRIGGER'
        });
    });
}
