type Props = {
  toast: { message: string; type: 'success' | 'error' } | null
  onDismiss: () => void
}

export default function TxToast({ toast, onDismiss }: Props) {
  if (!toast) return null

  const bg = toast.type === 'success' ? 'bg-green-900/80 border-green-700' : 'bg-red-900/80 border-red-700'
  const text = toast.type === 'success' ? 'text-green-200' : 'text-red-200'

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${bg}`}>
        <span className={`text-sm ${text}`}>{toast.message}</span>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-200 text-lg leading-none">&times;</button>
      </div>
    </div>
  )
}
