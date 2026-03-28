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
        className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500"
      >
        Cuzdan Bagla
      </button>
    )
  }

  if (isWrongChain) {
    return (
      <button
        onClick={switchToMonad}
        className="rounded-lg bg-yellow-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-yellow-500"
      >
        Monad'a Gec
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-mono text-purple-300">
        {address!.slice(0, 6)}...{address!.slice(-4)}
      </span>
      <button
        onClick={() => disconnect()}
        className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 hover:text-gray-200"
      >
        Cikis
      </button>
    </div>
  )
}
