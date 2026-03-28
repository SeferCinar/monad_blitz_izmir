import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n/LanguageContext'

type Props = {
  children: React.ReactNode
  fallbackMessage?: string
}

export default function WalletGuard({ children, fallbackMessage }: Props) {
  const { isConnected, isWrongChain, switchToMonad } = useAuth()
  const { connect } = useConnect()
  const { t } = useT()

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="mb-3 text-sm text-gray-400">
          {fallbackMessage || t('wallet.connectRequired')}
        </p>
        <button
          onClick={() => connect({ connector: injected() })}
          className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          {t('wallet.connectButton')}
        </button>
      </div>
    )
  }

  if (isWrongChain) {
    return (
      <div className="rounded-xl border border-yellow-800/50 bg-yellow-900/20 p-6 text-center">
        <p className="mb-3 text-sm text-yellow-300">
          {t('wallet.wrongChain')}
        </p>
        <button
          onClick={switchToMonad}
          className="rounded-lg bg-yellow-600 px-5 py-2 text-sm font-medium text-white hover:bg-yellow-500"
        >
          {t('wallet.switchButton')}
        </button>
      </div>
    )
  }

  return <>{children}</>
}
