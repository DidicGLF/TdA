import { useEffect } from 'react'

export function useModalBackButton(onClose: () => void) {
  useEffect(() => {
    history.pushState(null, '', location.href)
    const handler = () => onClose()
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
}
