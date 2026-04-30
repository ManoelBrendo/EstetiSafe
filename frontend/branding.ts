import type { AuthUser } from './types'
import defaultLogoPath from './lappui-mark.svg'

export interface BrandingSnapshot {
  clinicName: string
  brandLogo: string
  hasCustomLogo: boolean
  brandSubtitle: string
  initials: string
}

export interface PrepareClinicLogoOptions {
  size?: number
  quality?: number
  maxInputBytes?: number
}

export function getClinicInitials(name?: string | null): string {
  return (
    name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || 'LA'
  )
}

export function getClinicBranding(user?: AuthUser | null, fallbackName = "L'Appui"): BrandingSnapshot {
  if (user?.role === 'SUPPORT') {
    return {
      clinicName: user?.clinicName || 'Central de suporte',
      brandLogo: defaultLogoPath,
      hasCustomLogo: false,
      brandSubtitle: 'Operação técnica',
      initials: 'SU',
    }
  }

  const clinicName = user?.clinicName || fallbackName
  const hasCustomLogo = Boolean(user?.clinicLogoDataUrl)

  return {
    clinicName,
    brandLogo: user?.clinicLogoDataUrl || defaultLogoPath,
    hasCustomLogo,
    brandSubtitle: hasCustomLogo ? 'Painel da clínica' : "Plataforma L'Appui",
    initials: getClinicInitials(clinicName),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível processar a imagem selecionada'))
    image.src = dataUrl
  })
}

export async function prepareClinicLogoDataUrl(
  file: File,
  options: PrepareClinicLogoOptions = {}
): Promise<string> {
  const { size = 512, quality = 0.9, maxInputBytes = 5 * 1024 * 1024 } = options

  if (file.size > maxInputBytes) {
    throw new Error('Use uma imagem de até 5 MB para a logo da clínica')
  }

  const sourceDataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(sourceDataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Não foi possível preparar a area de edicao da logo')
  }

  context.clearRect(0, 0, size, size)

  const scale = Math.min(size / image.width, size / image.height)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const x = Math.round((size - width) / 2)
  const y = Math.round((size - height) / 2)

  context.drawImage(image, x, y, width, height)

  return canvas.toDataURL('image/webp', quality)
}
