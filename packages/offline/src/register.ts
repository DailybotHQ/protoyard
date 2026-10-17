import { CACHE_PREFIX } from './sw-source.ts';

/**
 * Inline script injected into index.html. Kept tiny and dependency-free.
 *
 *  - Registers `sw.js` next to the page, scoped to the page's folder, so the
 *    build works under any sub-path (`./` base) without knowing it.
 *  - Kill switch: opening the app with `?offline=0` unregisters this scope's
 *    worker and deletes its caches (for recovering from a bad deploy).
 *  - Never activates an update by itself: `window.__protoyardOffline.applyUpdate()`
 *    asks a waiting worker to take over (and reloads once it does).
 */
export function createRegisterScript(): string {
  return `(function () {
  if (!('serviceWorker' in navigator)) return;
  var swUrl = new URL('sw.js', document.baseURI).href;
  var scope = new URL('./', document.baseURI).href;
  var prefix = ${JSON.stringify(`${CACHE_PREFIX}:`)} + scope + ':';
  if (new URLSearchParams(location.search).get('offline') === '0') {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (reg) { if (reg.scope === scope) reg.unregister(); });
    });
    if (window.caches) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) { if (key.indexOf(prefix) === 0) caches.delete(key); });
      });
    }
    return;
  }
  var api = { registration: null, updateAvailable: false, applyUpdate: function () {
    var reg = api.registration;
    if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  } };
  window.__protoyardOffline = api;
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (api.updateAvailable && !reloading) { reloading = true; location.reload(); }
  });
  function watch(reg) {
    api.registration = reg;
    var mark = function () {
      if (reg.waiting && navigator.serviceWorker.controller) {
        api.updateAvailable = true;
        window.dispatchEvent(new CustomEvent('protoyard:offline-update'));
      }
    };
    mark();
    reg.addEventListener('updatefound', function () {
      var worker = reg.installing;
      if (worker) worker.addEventListener('statechange', mark);
    });
  }
  var start = function () {
    navigator.serviceWorker.register(swUrl, { scope: scope }).then(watch).catch(function (error) {
      console.warn('[protoyard] offline support is unavailable here:', error && error.message);
    });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();`;
}
