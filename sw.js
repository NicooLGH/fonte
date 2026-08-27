/* ============================================================
   FONTE — Service worker
   ============================================================
   Deux stratégies, selon la nature de la ressource :

   - La coquille de l'application (HTML, CSS, JS, icônes) est
     servie depuis le cache et rafraîchie en arrière-plan. Elle
     change rarement, et ça permet d'ouvrir le carnet sans
     réseau.

   - Les appels à Supabase ne sont JAMAIS mis en cache. Servir
     des séances ou un profil périmés serait pire que de ne rien
     afficher : on croirait ses données perdues, ou on écraserait
     du récent avec de l'ancien.
   ============================================================ */

const VERSION = 'fonte-v3.8.0';
const COQUILLE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(VERSION)
      .then(function(c){ return c.addAll(COQUILLE); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(cles){
      return Promise.all(cles.map(function(k){
        if(k !== VERSION) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  const url = new URL(e.request.url);

  // Tout ce qui n'est pas notre propre origine part directement
  // sur le réseau : Supabase, polices, bibliothèques.
  if(url.origin !== self.location.origin || e.request.method !== 'GET'){
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cache){
      const reseau = fetch(e.request).then(function(rep){
        if(rep && rep.status === 200){
          const copie = rep.clone();
          caches.open(VERSION).then(function(c){ c.put(e.request, copie); });
        }
        return rep;
      }).catch(function(){ return cache; });

      // Cache d'abord pour l'affichage immédiat, mise à jour ensuite
      return cache || reseau;
    })
  );
});

// Notification envoyée depuis la page (minuteur de repos, etc.)
self.addEventListener('message', function(e){
  const d = e.data || {};
  if(d.type === 'notif'){
    self.registration.showNotification(d.titre || 'FONTE', {
      body: d.corps || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: d.tag || 'fonte',
      renotify: true
    });
  }
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(liste){
      for(const c of liste){ if('focus' in c) return c.focus(); }
      if(self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
