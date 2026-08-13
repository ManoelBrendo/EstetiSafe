interface ClientAvatarProps {
  name?: string | null
  photoDataUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
}

function getInitials(name?: string | null) {
  return (
    name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || 'CL'
  )
}

export function ClientAvatar({ name, photoDataUrl, size = 'md', className = '' }: ClientAvatarProps) {
  const classes = ['client-avatar', 'client-avatar-' + size, className].filter(Boolean).join(' ')
  const label = name ? 'Foto de identificação de ' + name : 'Foto de identificação da cliente'

  if (photoDataUrl) {
    return (
      <div className={classes} aria-label={label}>
        <img src={photoDataUrl} alt={label} className="client-avatar-image" loading="lazy" />
      </div>
    )
  }

  return <div className={classes} aria-label={label}>{getInitials(name)}</div>
}