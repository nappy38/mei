// オフライン対応：一度開ければ、次からは電波が無くても開ける。
// 同じ場所（オリジン）のファイルだけキャッシュし、YouTube等は素通しする（オフラインでは単に鳴らないだけ）。
const CACHE = 'meditation-app-v7';
const CORE = ['./', './index.html', './icon.png', './manifest.json', './decor_leaves.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  // addAllは1つでも失敗すると全部キャンセルされるので、1つずつ試して失敗は無視する
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(CORE.map(url =>
        cache.add(url).catch(err => console.warn('[sw] cache失敗:', url, err))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return; // 他サイト（YouTube等）はそのまま

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200) cache.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network; // キャッシュがあれば即返す。無ければネットワークを待つ（初回はこちら）
    })
  );
});
