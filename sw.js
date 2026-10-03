/* Orion Warehouse — lets the app open with no connection, and quickly on slow Wi-Fi.
   Pages load fresh when the whole page arrives within 3 seconds; otherwise the copy saved on the device opens and the
   fresh one is saved for next time. Cognito calls are never cached. */
var CACHE = "orion-warehouse-v1";
var FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
var WAIT_MS = 3000;
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }));
  }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // a fresh copy (fetched by URL: a navigation request can't be re-used with options), read to the end before it is used,
  // so a download that starts and then crawls, stalls or breaks off counts as slow too
  var fresh = fetch(new Request(req.url, { cache: "no-store", credentials: "same-origin" })).then(function (r) {
    if (r.status === 204 || r.status === 205 || r.status === 304) return r;
    return r.arrayBuffer().then(function (buf) {
      var h = new Headers(r.headers); h.delete("content-encoding"); h.delete("content-length");   // the body is already unzipped
      return new Response(buf, { status: r.status, statusText: r.statusText, headers: h });
    });
  });
  // saved for next time when it arrives, even if the saved copy was already shown
  var stored = fresh.then(function (r) {
    if (!r.ok) return;
    var copy = r.clone();
    return caches.open(CACHE).then(function (c) { return c.put(req, copy); });
  }).catch(function () {});
  function saved() {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match("./index.html"); }).catch(function () { return null; });
  }
  e.respondWith(new Promise(function (resolve, reject) {
    var settled = false;
    function give(r) { if (!settled && r) { settled = true; resolve(r); } }
    // slow Wi-Fi: after 3 s open the saved copy (if there is one); the fresh copy keeps coming in the background
    var timer = setTimeout(function () { saved().then(give); }, WAIT_MS);
    fresh.then(function (r) { clearTimeout(timer); give(r); }, function () {
      clearTimeout(timer);
      saved().then(function (r) { if (r) give(r); else if (!settled) { settled = true; reject(new TypeError("offline")); } });
    });
  }));
  e.waitUntil(stored);
});
