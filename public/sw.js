/// <reference lib="webworker" />

// CardioCAn Service Worker — Push Notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const { title, body, icon, badge, tag, data, actions } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || "/icon-192.png",
      badge: badge || "/icon-192.png",
      tag,
      data,
      actions: actions || [],
      vibrate: [200, 100, 200],
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { data } = event.notification;
  const action = event.action;

  if (action === "administered" && data?.dogId && data?.medicationId) {
    // Log administration via API
    event.waitUntil(
      fetch(`/api/dogs/${data.dogId}/medications/${data.medicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledTime: data.scheduledTime || "push",
          status: "administered",
        }),
      })
        .then(() => {
          // Open the dog's medication page
          return self.clients.matchAll({ type: "window" });
        })
        .then((clients) => {
          const url = `/perros/${data.dogId}/medicamentos`;
          for (const client of clients) {
            if (client.url.includes("/perros") && "focus" in client) {
              client.navigate(url);
              return client.focus();
            }
          }
          return self.clients.openWindow(url);
        })
    );
  } else if (action === "snooze" && data?.dogId && data?.medicationId) {
    // Re-send notification in 10 minutes
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration
            .showNotification(event.notification.title, {
              body: event.notification.body + " (recordatorio)",
              icon: event.notification.icon,
              badge: event.notification.badge,
              tag: event.notification.tag + "-snooze",
              data: event.notification.data,
              actions: event.notification.actions,
              vibrate: [200, 100, 200],
              requireInteraction: true,
            })
            .then(resolve);
        }, 10 * 60 * 1000);
      })
    );
  } else {
    // Default: open the app
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        const url = data?.dogId
          ? `/perros/${data.dogId}/medicamentos`
          : "/perros";
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
    );
  }
});

// Activate immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
