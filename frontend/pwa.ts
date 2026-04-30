const SERVICE_WORKER_URL = '/sw.js'

export function registerLappuiPwa() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return
  if (import.meta.env.VITE_ENABLE_PWA === 'false') return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SERVICE_WORKER_URL)
      .then(registration => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing
          installingWorker?.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        void registration.update()
      })
      .catch(error => {
        console.warn("Nao foi possivel ativar o modo instalavel do L'Appui.", error)
      })
  }, { once: true })
}