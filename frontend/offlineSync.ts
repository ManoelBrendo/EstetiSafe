import { useState, useEffect } from 'react'
import type { AxiosInstance } from 'axios'
import toast from 'react-hot-toast'

export interface PendingRequest {
  id?: number
  url: string
  method: 'POST' | 'PUT' | 'PATCH'
  data: any
  headers: any
  timestamp: number
}

const DB_NAME = 'LappuiOfflineSync'
const STORE_NAME = 'offline_requests'

export function openOfflineSyncDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
  })
}

export async function queueOfflineRequest(requestData: Omit<PendingRequest, 'id' | 'timestamp'>): Promise<number> {
  const db = await openOfflineSyncDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const pending: PendingRequest = {
      ...requestData,
      timestamp: Date.now()
    }
    const request = store.add(pending)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      resolve(request.result as number)
      window.dispatchEvent(new CustomEvent('offline-sync-queue-updated'))
    }
  })
}

export async function getPendingRequests(): Promise<PendingRequest[]> {
  try {
    const db = await openOfflineSyncDb()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || [])
    })
  } catch (error) {
    console.error('Erro ao ler solicitacoes pendentes', error)
    return []
  }
}

export async function deletePendingRequest(id: number): Promise<void> {
  const db = await openOfflineSyncDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      resolve()
      window.dispatchEvent(new CustomEvent('offline-sync-queue-updated'))
    }
  })
}

let isSyncing = false

export async function syncOfflineRequests(api: AxiosInstance): Promise<void> {
  if (isSyncing || !navigator.onLine) return
  const pending = await getPendingRequests()
  if (pending.length === 0) return

  isSyncing = true
  toast.loading(`Sincronizando ${pending.length} item(ns) pendente(s) offline...`, { id: 'offline-sync' })

  let successCount = 0
  let failCount = 0

  for (const req of pending) {
    try {
      await api.request({
        url: req.url,
        method: req.method,
        data: req.data,
        headers: req.headers
      })
      if (req.id !== undefined) {
        await deletePendingRequest(req.id)
      }
      successCount++
    } catch (error) {
      console.error(`Erro ao sincronizar request ${req.id}`, error)
      failCount++
    }
  }

  isSyncing = false
  toast.dismiss('offline-sync')

  if (successCount > 0) {
    toast.success(`Sincronização concluída: ${successCount} item(ns) enviados ao servidor.`)
  }
  if (failCount > 0) {
    toast.error(`Falha ao sincronizar ${failCount} item(ns). Tentaremos novamente mais tarde.`)
  }
}

export function useOfflineSyncStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(0)

  const updateCount = async () => {
    const list = await getPendingRequests()
    setPendingCount(list.length)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('offline-sync-queue-updated', updateCount)

    void updateCount()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('offline-sync-queue-updated', updateCount)
    }
  }, [])

  return { isOnline, pendingCount }
}
