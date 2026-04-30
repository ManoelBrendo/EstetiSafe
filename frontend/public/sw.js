const APP_SHELL_CACHE = 'lappui-shell-v2'
const RUNTIME_CACHE = 'lappui-runtime-v2'
const CURRENT_CACHES = [APP_SHELL_CACHE, RUNTIME_CACHE]
const APP_SHELL_URLS = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/pwa-icon.svg']
const API_PATH_PREFIXES = ['/api/', '/auth/', '/clients', '/dashboard', '/billing', '/clinic', '/webhooks']

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('lappui-') && !CURRENT_CACHES.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (isApiLikeRequest(url)) return

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event.request))
    return
  }

  if (shouldCacheAsset(event.request)) {
    event.respondWith(staleWhileRevalidate(event.request))
  }
})

function isApiLikeRequest(url) {
  return API_PATH_PREFIXES.some(prefix => url.pathname === prefix.slice(0, -1) || url.pathname.startsWith(prefix))
}

function shouldCacheAsset(request) {
  const url = new URL(request.url)
  return url.pathname.startsWith('/assets/')
    || ['font', 'image', 'script', 'style'].includes(request.destination)
}

async function networkFirstPage(request) {
  const cache = await caches.open(APP_SHELL_CACHE)

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cachedPage = await cache.match(request)
    const cachedShell = await cache.match('/index.html') || await cache.match('/')
    const offlinePage = await cache.match('/offline.html')
    return cachedPage || cachedShell || offlinePage || Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)

  const fetched = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached)

  return cached || fetched
}