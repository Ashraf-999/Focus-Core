const APP_URL = './';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'show-notification') return;

  const { title, body, tag } = event.data;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: tag || `focus-core-${Date.now()}`,
    renotify: true,
    silent: false,
    requireInteraction: false,
    data: { url: APP_URL }
  }).catch((error) => {
    console.error('Service Worker showNotification failed:', error);
    throw error;
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClient = windowClients.find((client) => {
      const pathname = new URL(client.url).pathname;
      return pathname.endsWith('/') || pathname.endsWith('/index.html');
    });

    if (appClient) {
      await appClient.focus();
      return;
    }

    await self.clients.openWindow(APP_URL);
  })());
});
