import { useState, useEffect, useCallback } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

export type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

export function useTxFeedback() {
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const status: TxStatus = isPending
    ? 'pending'
    : isConfirming
      ? 'confirming'
      : isSuccess
        ? 'success'
        : writeError || receiptError
          ? 'error'
          : 'idle'

  const loading = status === 'pending' || status === 'confirming'

  useEffect(() => {
    if (isSuccess) {
      setToast({ message: 'Islem basarili!', type: 'success' })
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [isSuccess])

  useEffect(() => {
    const err = writeError || receiptError
    if (err) {
      const msg = extractErrorMessage(err)
      setToast({ message: msg, type: 'error' })
      const t = setTimeout(() => { setToast(null); reset() }, 6000)
      return () => clearTimeout(t)
    }
  }, [writeError, receiptError, reset])

  const dismissToast = useCallback(() => setToast(null), [])

  return { writeContract, txHash, status, loading, toast, dismissToast }
}

function extractErrorMessage(error: Error): string {
  const msg = error.message || ''

  // Common contract revert reasons
  const revertMatch = msg.match(/reason:\s*"?([^"]+)"?/i)
    || msg.match(/reverted with reason string '([^']+)'/i)
    || msg.match(/execution reverted:\s*"?([^"]+)"?/i)
  if (revertMatch) return revertMatch[1]!

  if (msg.includes('User rejected') || msg.includes('user rejected')) return 'Islem reddedildi.'
  if (msg.includes('insufficient funds')) return 'Yetersiz bakiye.'

  return 'Islem basarisiz oldu.'
}
