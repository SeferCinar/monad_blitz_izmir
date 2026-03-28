import { Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { VoteLobbyABI } from '../abi/VoteLobby'
import { formatEther, type Address } from 'viem'
import { loadCid } from '../lib/session'

const PHASE_LABELS_QUIZ = ['Beklemede', 'Aktif', 'Reveal', 'Bitti'] as const
const PHASE_LABELS_VOTE = ['Beklemede', 'Oylama', 'Reveal', 'Bitti'] as const
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const
const PHASE_BG = ['bg-yellow-900/20', 'bg-green-900/20', 'bg-blue-900/20', 'bg-gray-800/50'] as const

type Props = {
  address: Address
  type: 'quiz' | 'vote'
  phaseFilter?: string
}

export default function LobbyCard({ address, type, phaseFilter = 'all' }: Props) {
  const abi = type === 'quiz' ? QuizLobbyABI : VoteLobbyABI
  const phaseLabels = type === 'quiz' ? PHASE_LABELS_QUIZ : PHASE_LABELS_VOTE
  const { address: userAddr } = useAccount()

  const { data: lobbyName } = useReadContract({ address, abi, functionName: 'name' })
  const { data: phase } = useReadContract({ address, abi, functionName: 'phase' })
  const { data: memberCount } = useReadContract({ address, abi, functionName: 'memberCount' })
  const { data: stake } = useReadContract({ address, abi, functionName: 'stake' })
  const { data: owner } = useReadContract({ address, abi, functionName: 'owner' })
  const { data: isMember } = useReadContract({
    address, abi, functionName: 'isMember',
    args: userAddr ? [userAddr] : undefined,
    query: { enabled: !!userAddr },
  })

  const phaseIdx = phase !== undefined ? Number(phase) : 0

  if (phaseFilter !== 'all' && String(phaseIdx) !== phaseFilter) return null

  const isOwner = userAddr && owner && userAddr.toLowerCase() === (owner as string).toLowerCase()
  const memCount = memberCount !== undefined ? Number(memberCount) : 0
  const icon = type === 'quiz' ? '🎯' : '🗳️'

  return (
    <Link
      to={type === 'quiz' ? `/${type}/${address}?cid=${loadCid(address)}` : `/${type}/${address}`}
      className="group block rounded-xl border border-gray-800 bg-gray-900 p-5 transition-all duration-200 hover:border-purple-600/40 hover:bg-gray-900/80 hover:shadow-lg hover:shadow-purple-900/10 hover:-translate-y-0.5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          {isOwner && (
            <span className="rounded-full bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-300">
              Senin
            </span>
          )}
          {isMember && !isOwner && (
            <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-300">
              Katildin
            </span>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PHASE_BG[phaseIdx]} ${PHASE_COLORS[phaseIdx]}`}>
          {phaseLabels[phaseIdx]}
        </span>
      </div>
      <p className="mb-2 text-sm font-medium text-white truncate">
        {(lobbyName as string) || 'Isimsiz Lobi'}
      </p>
      <div className="flex gap-4 text-sm text-gray-400">
        <span>{memCount} katilimci</span>
        {stake !== undefined && Number(stake) > 0 && (
          <span>{formatEther(stake)} MON</span>
        )}
      </div>
    </Link>
  )
}
