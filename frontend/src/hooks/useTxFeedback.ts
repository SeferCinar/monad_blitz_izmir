import { useState, useEffect, useCallback } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useT } from '../i18n/LanguageContext'

export type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

export function useTxFeedback() {
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })
  const { t } = useT()

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
      setToast({ message: t('tx.success'), type: 'success' })
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [isSuccess, t])

  useEffect(() => {
    const err = writeError || receiptError
    if (err) {
      const msg = extractErrorMessage(err, t)
      setToast({ message: msg, type: 'error' })
      const timer = setTimeout(() => { setToast(null); reset() }, 6000)
      return () => clearTimeout(timer)
    }
  }, [writeError, receiptError, reset, t])

  const dismissToast = useCallback(() => setToast(null), [])

  return { writeContract, txHash, status, loading, toast, dismissToast }
}

function extractErrorMessage(error: Error, t: (key: string, params?: Record<string, string | number>) => string): string {
  const msg = error.message || ''

  const revertMatch = msg.match(/reason:\s*"?([^"]+)"?/i)
    || msg.match(/reverted with reason string '([^']+)'/i)
    || msg.match(/execution reverted:\s*"?([^"]+)"?/i)
  if (revertMatch) return revertMatch[1]!

  if (msg.includes('User rejected') || msg.includes('user rejected')) return t('tx.rejected')
  if (msg.includes('insufficient funds')) return t('tx.insufficientFunds')

  return t('tx.failed')
}
