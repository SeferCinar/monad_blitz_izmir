type Props = {
  toast: { message: string; type: 'success' | 'error' } | null
  onDismiss: () => void
}

export default function TxToast({ toast, onDismiss }: Props) {
  if (!toast) return null

  const isSuccess = toast.type === 'success'
  const bg = isSuccess ? 'bg-green-900/90 border-green-700/50' : 'bg-red-900/90 border-red-700/50'
  const text = isSuccess ? 'text-green-200' : 'text-red-200'
  const icon = isSuccess ? '✓' : '✕'
  const iconColor = isSuccess ? 'text-green-400' : 'text-red-400'

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm ${bg}`}>
        <span className={`text-lg font-bold ${iconColor}`}>{icon}</span>
        <span className={`text-sm font-medium ${text}`}>{toast.message}</span>
        <button onClick={onDismiss} className="ml-2 text-gray-400 hover:text-gray-200 text-lg leading-none transition">&times;</button>
      </div>
    </div>
  )
}
