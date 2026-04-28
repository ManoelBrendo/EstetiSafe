/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_SUPPORT_NAME?: string
  readonly VITE_SUPPORT_EMAIL?: string
  readonly VITE_SUPPORT_PHONE?: string
  readonly VITE_ENABLE_PWA?: string
  readonly VITE_MARKETING_BRAND_NAME?: string
  readonly VITE_MARKETING_BRAND_TAGLINE?: string
  readonly VITE_MARKETING_CLINIC_LABEL?: string
  readonly VITE_MARKETING_BRAND_LOGO?: string
  readonly VITE_MARKETING_POWERED_BY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}