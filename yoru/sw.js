// オフライン対応：一度開ければ、次からは電波が無くても開ける。
// 同じ場所（オリジン）のファイルだけキャッシュし、YouTube等は素通しする（オフラインでは単に鳴らないだけ）。
//
// 【2026-08-23 変更】本体をキャッシュ優先に変えた。
// 以前はネット優先だったが、電波が「弱い／繋がっているのに外へ出られない」状態だと
// fetchが失敗せずぶら下がり、画面が真っ白のまま開かなくなる。まず必ずキャッシュを返し、
// 更新は裏で取ってくる（＝次に開いた時に最新になる）。魅力アップ音楽アプリと同じ方式。
const CACHE = 'night-app-v6';
const SHELL = './index.html';                                  // これだけは必須
const EXTRA = ['./', './icon.png', './manifest.json', './decor_leaves.png']; // 失敗しても致命的でない

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      // 本体は「入らなければインストールを失敗させる」。
      // 握りつぶすと、中身が空のまま“インストール済み”になり、オフラインで初めて気づくため。
      await cache.add(SHELL);
      await Promise.all(EXTRA.map(url =>
        cache.add(url).catch(err => console.warn('[sw] cache失敗:', url, err))
      ));
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 裏でネットから取り直してキャッシュを更新する（結果は待たない）
function revalidate(cache, request) {
  return fetch(request).then(res => {
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return; // 他サイト（YouTube等）はそのまま

  // ページを開く時（アドレスバー・ホーム画面アイコン・リロード）
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        // ①そのURL ②./index.html ③./ の順に探す。どれかが必ず当たるようにする
        const cached = await cache.match(e.request)
                    || await cache.match(SHELL)
                    || await cache.match('./');
        if (cached) {
          revalidate(cache, e.request); // 待たない。更新は次回の起動から効く
          return cached;
        }
        // キャッシュが空＝初回。ここだけはネットを待つしかない
        const res = await revalidate(cache, e.request);
        return res || new Response(
          '<meta charset="utf-8"><body style="background:#0b0f18;color:#fff;font-family:sans-serif;padding:2em">' +
          'まだオフライン用の保存が終わっていません。<br>電波のある場所で一度開いてください。</body>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
    return;
  }

  // それ以外のファイル（画像・アイコンなど）もキャッシュ優先
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      if (cached) { revalidate(cache, e.request); return cached; }
      const res = await revalidate(cache, e.request);
      return res || Response.error();
    })
  );
});
