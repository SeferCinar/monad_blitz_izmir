import { Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { VoteLobbyABI } from '../abi/VoteLobby'
import { formatEther, type Address } from 'viem'

const PHASE_LABELS_QUIZ = ['Beklemede', 'Aktif', 'Reveal', 'Bitti'] as const
const PHASE_LABELS_VOTE = ['Beklemede', 'Oylama', 'Reveal', 'Bitti'] as const
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const

type Props = {
  address: Address
  type: 'quiz' | 'vote'
  phaseFilter?: string
}

export default function LobbyCard({ address, type, phaseFilter = 'all' }: Props) {
  const abi = type === 'quiz' ? QuizLobbyABI : VoteLobbyABI
  const phaseLabels = type === 'quiz' ? PHASE_LABELS_QUIZ : PHASE_LABELS_VOTE
  const { address: userAddr } = useAccount()

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

  // Phase filter
  if (phaseFilter !== 'all' && String(phaseIdx) !== phaseFilter) return null

  const isOwner = userAddr && owner && userAddr.toLowerCase() === (owner as string).toLowerCase()

  return (
    <Link
      to={`/${type}/${address}`}
      className="block rounded-xl border border-gray-800 bg-gray-900 p-5 transition hover:border-purple-600/50 hover:bg-gray-900/80"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-gray-800 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-gray-400">
            {type === 'quiz' ? 'Quiz' : 'Vote'}
          </span>
          {isOwner && (
            <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-300">
              Owner
            </span>
          )}
          {isMember && !isOwner && (
            <span className="rounded-md bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-300">
              Uye
            </span>
          )}
        </div>
        <span className={`text-sm font-medium ${PHASE_COLORS[phaseIdx]}`}>
          {phaseLabels[phaseIdx]}
        </span>
      </div>
      <p className="mb-2 font-mono text-sm text-gray-500">
        {address.slice(0, 10)}...{address.slice(-8)}
      </p>
      <div className="flex gap-4 text-sm text-gray-400">
        <span>{memberCount !== undefined ? Number(memberCount) : '...'} uye</span>
        <span>{stake !== undefined ? formatEther(stake) : '...'} MON stake</span>
      </div>
    </Link>
  )
}
