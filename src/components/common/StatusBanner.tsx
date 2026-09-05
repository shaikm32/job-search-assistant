import type { ReactNode } from 'react'

interface StatusBannerProps {
  tone: 'loading' | 'error' | 'notice'
  children: ReactNode
}

export function StatusBanner({ tone, children }: StatusBannerProps) {
  if (tone === 'loading') {
    return (
      <p className="banner banner--loading" role="status">
        {children}
      </p>
    )
  }
  if (tone === 'error') {
    return (
      <p className="banner banner--error" role="alert">
        {children}
      </p>
    )
  }
  return <p className="banner banner--notice">{children}</p>
}
