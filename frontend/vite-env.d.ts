/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_SUPPORT_NAME?: string
  readonly VITE_SUPPORT_EMAIL?: string
  readonly VITE_SUPPORT_PHONE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
