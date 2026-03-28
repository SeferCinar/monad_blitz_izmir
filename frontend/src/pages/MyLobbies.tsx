import { useReadContract, useReadContracts } from 'wagmi'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { VoteLobbyABI } from '../abi/VoteLobby'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'
import { useAuth } from '../hooks/useAuth'
import LobbyCard from '../components/LobbyCard'
import WalletGuard from '../components/WalletGuard'
import type { Address } from 'viem'
import { useT } from '../i18n/LanguageContext'

export default function MyLobbies() {
  const { address: userAddr } = useAuth()
  const { t } = useT()

  const { data: quizCount } = useReadContract({
    address: LOBBY_FACTORY_ADDRESS,
    abi: LobbyFactoryABI,
    functionName: 'quizLobbyCount',
  })

  const { data: voteCount } = useReadContract({
    address: LOBBY_FACTORY_ADDRESS,
    abi: LobbyFactoryABI,
    functionName: 'voteLobbyCount',
  })

  const quizIndexes = quizCount ? Array.from({ length: Number(quizCount) }, (_, i) => i) : []
  const voteIndexes = voteCount ? Array.from({ length: Number(voteCount) }, (_, i) => i) : []

  const { data: quizAddresses } = useReadContracts({
    contracts: quizIndexes.map((i) => ({
      address: LOBBY_FACTORY_ADDRESS,
      abi: LobbyFactoryABI,
      functionName: 'quizLobbies' as const,
      args: [BigInt(i)] as const,
    })),
  })

  const { data: voteAddresses } = useReadContracts({
    contracts: voteIndexes.map((i) => ({
      address: LOBBY_FACTORY_ADDRESS,
      abi: LobbyFactoryABI,
      functionName: 'voteLobbies' as const,
      args: [BigInt(i)] as const,
    })),
  })

  const quizList = quizAddresses?.filter((r) => r.status === 'success').map((r) => r.result as Address) ?? []
  const voteList = voteAddresses?.filter((r) => r.status === 'success').map((r) => r.result as Address) ?? []

  const { data: quizMembership } = useReadContracts({
    contracts: quizList.flatMap((addr) => [
      { address: addr, abi: QuizLobbyABI, functionName: 'isMember' as const, args: [userAddr!] as const },
      { address: addr, abi: QuizLobbyABI, functionName: 'owner' as const },
    ]),
    query: { enabled: !!userAddr && quizList.length > 0 },
  })

  const { data: voteMembership } = useReadContracts({
    contracts: voteList.flatMap((addr) => [
      { address: addr, abi: VoteLobbyABI, functionName: 'isMember' as const, args: [userAddr!] as const },
      { address: addr, abi: VoteLobbyABI, functionName: 'owner' as const },
    ]),
    query: { enabled: !!userAddr && voteList.length > 0 },
  })

  const myQuizzes = quizList.filter((_, i) => {
    if (!quizMembership) return false
    const memberResult = quizMembership[i * 2]
    const ownerResult = quizMembership[i * 2 + 1]
    const isMem = memberResult?.status === 'success' && memberResult.result === true
    const isOwn = ownerResult?.status === 'success' && (ownerResult.result as string).toLowerCase() === userAddr?.toLowerCase()
    return isMem || isOwn
  })

  const myVotes = voteList.filter((_, i) => {
    if (!voteMembership) return false
    const memberResult = voteMembership[i * 2]
    const ownerResult = voteMembership[i * 2 + 1]
    const isMem = memberResult?.status === 'success' && memberResult.result === true
    const isOwn = ownerResult?.status === 'success' && (ownerResult.result as string).toLowerCase() === userAddr?.toLowerCase()
    return isMem || isOwn
  })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">{t('myLobbies.title')}</h1>

      <WalletGuard fallbackMessage={t('myLobbies.connectHint')}>
        {myQuizzes.length === 0 && myVotes.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-gray-500">{t('myLobbies.empty')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {myQuizzes.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-white">{t('myLobbies.quizLobbies')} ({myQuizzes.length})</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {myQuizzes.map((addr) => (
                    <LobbyCard key={addr} address={addr} type="quiz" />
                  ))}
                </div>
              </section>
            )}
            {myVotes.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-white">{t('myLobbies.voteLobbies')} ({myVotes.length})</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {myVotes.map((addr) => (
                    <LobbyCard key={addr} address={addr} type="vote" />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </WalletGuard>
    </div>
  )
}
