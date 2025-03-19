const CACHE_NAME = 'ai-assistant-v2';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Skip API calls - don't cache them
  if (event.request.url.includes('api.anthropic.com') || 
      event.request.url.includes('api.search.brave.com') ||
      event.request.url.includes('api.deepseek.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
            
          return response;
        });
      })
  );
});

// Handle background sync for offline message sending
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Function to sync messages when back online
async function syncMessages() {
  try {
    // Get queued messages from IndexedDB
    const messages = await getQueuedMessages();
    
    // Send each message
    for (const message of messages) {
      await sendMessage(message);
      await removeMessageFromQueue(message.id);
    }
    
    // Notify the client that messages have been sent
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        messages: messages.length
      });
    }
  } catch (error) {
    console.error('Error syncing messages:', error);
  }
}

// Handle push notifications
self.addEventListener('push', event => {
  const title = 'AI Assistant';
  const options = {
    body: event.data ? event.data.text() : 'New message from your AI Assistant',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'open',
        title: 'Open app'
      },
      {
        action: 'close',
        title: 'Dismiss'
      },
    ]
  };
  
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then(clientList => {
        // If a window client is already open, focus it
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
  );
});

// These are placeholder functions - in a real implementation,
// you would use IndexedDB to manage the message queue
async function getQueuedMessages() {
  // Placeholder - should retrieve messages from IndexedDB
  return [];
}

async function sendMessage(message) {
  // Placeholder - would actually send the message to the API
  return true;
}

async function removeMessageFromQueue(messageId) {
  // Placeholder - would remove the message from IndexedDB
  return true;
}
