/* AVEN. service worker: shows push notifications and opens the right page when one is clicked. No caching. */
self.addEventListener('push', (event) => {
  let message = { title: 'AVEN.', body: 'You have a new notification.', url: '/workspace/inbox' };
  try { if (event.data) message = { ...message, ...event.data.json() }; } catch { /* keep the default text */ }
  event.waitUntil(self.registration.showNotification(String(message.title).slice(0, 80), { body: String(message.body).slice(0, 200), data: { url: message.url }, tag: 'aven-notification', icon: '/assets/aven-hero.svg' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open pages on this site, whatever the payload says.
  let target = new URL('/workspace/inbox', self.location.origin);
  try { const candidate = new URL(event.notification.data && event.notification.data.url, self.location.origin); if (candidate.origin === self.location.origin) target = candidate; } catch { /* use the inbox */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => client.url.startsWith(self.location.origin));
    return open ? open.navigate(target.href).then((client) => client && client.focus()) : self.clients.openWindow(target.href);
  }));
});
