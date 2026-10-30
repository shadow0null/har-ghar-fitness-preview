// Har Ghar Fitness: Monetag push removed 2026-10-30. This worker unregisters itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => { self.registration.unregister(); });
