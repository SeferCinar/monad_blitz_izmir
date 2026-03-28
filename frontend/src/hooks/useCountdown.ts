import { useState, useEffect } from 'react'

/**
 * Verilen deadline timestamp'ine (saniye) kadar geri sayim yapar.
 * remaining <= 0 ise sure dolmus demektir.
 */
export function useCountdown(deadlineSeconds: number | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (deadlineSeconds === undefined || deadlineSeconds === 0) {
      setRemaining(null)
      return
    }

    const update = () => {
      const now = Math.floor(Date.now() / 1000)
      setRemaining(Math.max(0, deadlineSeconds - now))
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [deadlineSeconds])

  return remaining
}

/**
 * Saniyeyi "Xdk Ys" formatina cevir
 */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Sure doldu'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return s > 0 ? `${m}dk ${s}s` : `${m}dk`
}
