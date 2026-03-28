import { useCountdown, formatCountdown } from '../hooks/useCountdown'

type Props = {
  deadline: number | undefined
  label: string
}

export default function CountdownTimer({ deadline, label }: Props) {
  const remaining = useCountdown(deadline)

  if (remaining === null) return null

  const isUrgent = remaining > 0 && remaining <= 30
  const isExpired = remaining <= 0

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
      isExpired
        ? 'bg-gray-800 text-gray-500'
        : isUrgent
          ? 'bg-red-900/30 text-red-400 animate-pulse'
          : 'bg-gray-800 text-gray-300'
    }`}>
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-mono">{formatCountdown(remaining)}</span>
    </div>
  )
}
