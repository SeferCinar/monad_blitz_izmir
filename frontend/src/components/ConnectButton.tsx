import { useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useAuth } from '../hooks/useAuth'

export default function ConnectButton() {
  const { address, isConnected, isWrongChain, switchToMonad } = useAuth()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: injected() })}
        className="rounded-full bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-200"
      >
        Baglan
      </button>
    )
  }

  if (isWrongChain) {
    return (
      <button
        onClick={switchToMonad}
        className="rounded-full bg-yellow-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-yellow-500 transition-all duration-200 animate-pulse"
      >
        Monad'a Gec
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-gray-800/80 px-3 py-1.5 text-xs font-mono text-purple-300">
        {address!.slice(0, 6)}...{address!.slice(-4)}
      </span>
      <button
        onClick={() => disconnect()}
        className="rounded-full bg-gray-800/60 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-all duration-200"
      >
        Cikis
      </button>
    </div>
  )
}
