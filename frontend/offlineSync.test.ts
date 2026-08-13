import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  queueOfflineRequest,
  getPendingRequests,
  deletePendingRequest,
  syncOfflineRequests
} from './offlineSync'
import toast from 'react-hot-toast'

// Mock toast
vi.mock('react-hot-toast', () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn()
  }
}))

// In-memory IndexedDB mock
class MockRequest {
  onerror: any = null
  onsuccess: any = null
  result: any = null
  error: any = null
}

let mockDbStore: any[] = []
let nextId = 1

const mockDb = {
  objectStoreNames: {
    contains: () => true
  },
  transaction: (storeName: string, mode: string) => {
    return {
      objectStore: (name: string) => {
        return {
          add: (item: any) => {
            const req = new MockRequest()
            setTimeout(() => {
              const id = nextId++
              const saved = { ...item, id }
              mockDbStore.push(saved)
              req.result = id
              if (req.onsuccess) req.onsuccess()
            }, 0)
            return req
          },
          getAll: () => {
            const req = new MockRequest()
            setTimeout(() => {
              req.result = [...mockDbStore]
              if (req.onsuccess) req.onsuccess()
            }, 0)
            return req
          },
          delete: (id: number) => {
            const req = new MockRequest()
            setTimeout(() => {
              mockDbStore = mockDbStore.filter(x => x.id !== id)
              if (req.onsuccess) req.onsuccess()
            }, 0)
            return req
          }
        }
      }
    }
  }
}

const mockIndexedDB = {
  open: () => {
    const req = new MockRequest()
    setTimeout(() => {
      req.result = mockDb
      if (req.onsuccess) req.onsuccess()
    }, 0)
    return req
  }
}

;(globalThis as any).indexedDB = mockIndexedDB as any

// Mock window event system
const listeners = new Map<string, Set<Function>>()

;(globalThis as any).window = {
  dispatchEvent: (event: any) => {
    const type = event.type
    listeners.get(type)?.forEach((cb: any) => cb(event))
    return true
  },
  addEventListener: (type: string, cb: Function) => {
    if (!listeners.has(type)) {
      listeners.set(type, new Set())
    }
    listeners.get(type)!.add(cb)
  },
  removeEventListener: (type: string, cb: Function) => {
    listeners.get(type)?.delete(cb)
  }
} as any

Object.defineProperty(globalThis, 'navigator', {
  value: {
    onLine: true
  },
  configurable: true,
  writable: true
})

;(globalThis as any).CustomEvent = class CustomEvent {
  type: string
  detail: any
  constructor(type: string, options?: any) {
    this.type = type
    this.detail = options?.detail
  }
} as any

describe('Offline Sync Manager', () => {
  beforeEach(() => {
    mockDbStore = []
    nextId = 1
    vi.clearAllMocks()
  })

  it('queues a request successfully and increments id', async () => {
    const id1 = await queueOfflineRequest({
      url: '/api/test-1',
      method: 'PUT',
      data: { value: 1 },
      headers: {}
    })
    const id2 = await queueOfflineRequest({
      url: '/api/test-2',
      method: 'POST',
      data: { value: 2 },
      headers: {}
    })

    expect(id1).toBe(1)
    expect(id2).toBe(2)

    const pending = await getPendingRequests()
    expect(pending).toHaveLength(2)
    expect(pending[0].url).toBe('/api/test-1')
    expect(pending[1].url).toBe('/api/test-2')
  })

  it('deletes a pending request by id', async () => {
    await queueOfflineRequest({
      url: '/api/test-1',
      method: 'PUT',
      data: { value: 1 },
      headers: {}
    })
    await queueOfflineRequest({
      url: '/api/test-2',
      method: 'POST',
      data: { value: 2 },
      headers: {}
    })

    await deletePendingRequest(1)

    const pending = await getPendingRequests()
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe(2)
  })

  it('syncs offline requests successfully via Axios', async () => {
    await queueOfflineRequest({
      url: '/api/test-1',
      method: 'PUT',
      data: { value: 1 },
      headers: {}
    })

    const apiRequestMock = vi.fn().mockResolvedValue({ status: 200, data: { ok: true } })
    const apiMock = {
      request: apiRequestMock
    } as any

    await syncOfflineRequests(apiMock)

    expect(apiRequestMock).toHaveBeenCalledWith({
      url: '/api/test-1',
      method: 'PUT',
      data: { value: 1 },
      headers: {}
    })

    const pendingAfterSync = await getPendingRequests()
    expect(pendingAfterSync).toHaveLength(0)
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Sincronização concluída'))
  })

  it('keeps failed requests in the queue and notifies user', async () => {
    await queueOfflineRequest({
      url: '/api/test-1',
      method: 'PUT',
      data: { value: 1 },
      headers: {}
    })

    const apiRequestMock = vi.fn().mockRejectedValue(new Error('Network error'))
    const apiMock = {
      request: apiRequestMock
    } as any

    await syncOfflineRequests(apiMock)

    const pendingAfterSync = await getPendingRequests()
    expect(pendingAfterSync).toHaveLength(1)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao sincronizar'))
  })
})
