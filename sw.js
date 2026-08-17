const CACHE_NAME = 'gameacg-v6';

const APP_SHELL = [
  '/',
  '/index.html',
  '/js/app.js',
  '/js/cloud-sync.js',
  '/css/styles.min.css',
  '/css/styles.css',
  '/manifest.json'
];

function isAppShell(url) {
  const pathname = url.pathname;
  return APP_SHELL.includes(pathname) ||
    pathname.startsWith('/js/') ||
    pathname.startsWith('/css/') ||
    pathname === '/index.html' ||
    pathname === '/';
}

function isDataFile(url) {
  const pathname = url.pathname;
  return pathname.endsWith('/games.json') ||
    pathname.endsWith('/collections.json') ||
    pathname.endsWith('/config.json');
}

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// Network-first: 先请求网络，成功后更新缓存并返回；失败才用缓存
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw err;
  }
}

// Cache-first: 有缓存直接返回，没有才请求网络并缓存
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  const networkResponse = await fetch(request);
  if (networkResponse && networkResponse.status === 200) {
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 应用壳（HTML/JS/CSS）和数据文件必须 network-first，否则新部署会被旧缓存挡住
  if (isAppShell(url) || isDataFile(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 其他静态资源（图片、字体等）用 cache-first，减少重复下载
  event.respondWith(cacheFirst(event.request));
});
