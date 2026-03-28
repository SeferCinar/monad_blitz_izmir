import { useAccount, useSwitchChain } from 'wagmi'
import { monadTestnet } from '../config/wagmi'

export function useAuth() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const isWrongChain = isConnected && chainId !== monadTestnet.id
  const isReady = isConnected && !isWrongChain

  const switchToMonad = () => {
    switchChain({ chainId: monadTestnet.id })
  }

  return { address, isConnected, isWrongChain, isReady, switchToMonad }
}
