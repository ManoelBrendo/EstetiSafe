/**
 * Parses a date string safely, resolving compatibility bugs on Safari/WebKit
 * and avoiding timezone shifting (e.g. YYYY-MM-DD shifting back by 1 day in local TZ).
 */
export function parseSafeDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  // If it's a timestamp
  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const str = String(value).trim()
  if (!str) return null

  // Safari fix: replace spaces with 'T' in ISO dates
  let normalized = str
  if (str.includes(' ') && !str.includes('T')) {
    normalized = str.replace(' ', 'T')
  }

  // Timezone shift fix: if it's a short date format (YYYY-MM-DD),
  // Safari/Chrome parses it as UTC. When formatted locally, it shifts by timezone.
  // We append T12:00:00 to parse it as midday local/UTC safely without changing the date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = normalized + 'T12:00:00'
  }

  const parsed = new Date(normalized)

  // Fallback for Safari/Legacy browsers if parsing still failed
  if (Number.isNaN(parsed.getTime())) {
    // Attempt parsing "YYYY/MM/DD HH:mm:ss" style
    const cleaned = str.replace(/-/g, '/')
    const fallbackParsed = new Date(cleaned)
    if (!Number.isNaN(fallbackParsed.getTime())) {
      return fallbackParsed
    }
    return null
  }

  return parsed
}

/**
 * Formats a date to "DD/MM/YYYY" format safely.
 */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = parseSafeDate(value)
  if (!date) return 'Não informado'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(date)
}

/**
 * Formats a date-time to "DD/MM/YYYY HH:MM" format safely.
 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = parseSafeDate(value)
  if (!date) return 'Não informado'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

/**
 * Formats date into standard YYYY-MM-DD input format.
 */
export function formatDateInput(value: string | number | Date | null | undefined): string {
  const date = parseSafeDate(value)
  if (!date) return ''
  
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  
  return `${yyyy}-${mm}-${dd}`
}
