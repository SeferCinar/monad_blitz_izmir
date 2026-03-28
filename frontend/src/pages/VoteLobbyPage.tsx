import { useParams } from 'react-router-dom'
import { useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { VoteLobbyABI } from '../abi/VoteLobby'
import { formatEther, type Address, keccak256, encodePacked } from 'viem'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTxFeedback } from '../hooks/useTxFeedback'
import { useVoteEvents } from '../hooks/useContractEvents'
import WalletGuard from '../components/WalletGuard'
import TxToast from '../components/TxToast'
import CountdownTimer from '../components/CountdownTimer'
import MemberList from '../components/MemberList'
import { generateRandomBytes32 } from '../lib/crypto'

const PHASE_LABELS = ['Beklemede', 'Oylama', 'Reveal', 'Bitti'] as const
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const
const PHASE_BG = ['bg-yellow-900/20', 'bg-green-900/20', 'bg-blue-900/20', 'bg-gray-800/50'] as const

const VOTE_STYLES = [
  { bg: 'bg-red-600', hover: 'hover:bg-red-500', selected: 'ring-2 ring-red-300 bg-red-500', emoji: '🔴' },
  { bg: 'bg-blue-600', hover: 'hover:bg-blue-500', selected: 'ring-2 ring-blue-300 bg-blue-500', emoji: '🔵' },
  { bg: 'bg-yellow-500', hover: 'hover:bg-yellow-400', selected: 'ring-2 ring-yellow-300 bg-yellow-400', emoji: '🟡' },
  { bg: 'bg-green-600', hover: 'hover:bg-green-500', selected: 'ring-2 ring-green-300 bg-green-500', emoji: '🟢' },
  { bg: 'bg-purple-600', hover: 'hover:bg-purple-500', selected: 'ring-2 ring-purple-300 bg-purple-500', emoji: '🟣' },
  { bg: 'bg-orange-600', hover: 'hover:bg-orange-500', selected: 'ring-2 ring-orange-300 bg-orange-500', emoji: '🟠' },
]

// LocalStorage key'leri
const voteStorageKey = (lobby: string) => `vote-commit-${lobby}`

type SavedVoteCommit = { option: string; salt: string }

function saveVoteCommit(lobby: string, commit: SavedVoteCommit) {
  localStorage.setItem(voteStorageKey(lobby), JSON.stringify(commit))
}
function loadVoteCommit(lobby: string): SavedVoteCommit | null {
  try { return JSON.parse(localStorage.getItem(voteStorageKey(lobby)) || 'null') } catch { return null }
}

export default function VoteLobbyPage() {
  const { address: lobbyAddr } = useParams<{ address: string }>()
  const lobby = lobbyAddr as Address
  const { address: userAddr } = useAuth()

  useVoteEvents(lobby)

  const { data: lobbyName } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'name' })
  const { data: owner } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'owner' })
  const { data: phase } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'phase' })
  const { data: optionCount } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'optionCount' })
  const { data: voteDuration } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'voteDuration' })
  const { data: revealWindow } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'revealWindow' })
  const { data: stake } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'stake' })
  const { data: memberCount } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'memberCount' })
  const { data: totalRevealed } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'totalRevealed' })
  const { data: isMember } = useReadContract({
    address: lobby, abi: VoteLobbyABI, functionName: 'isMember', args: userAddr ? [userAddr] : undefined,
    query: { enabled: !!userAddr },
  })
  const { data: voteStartTime } = useReadContract({
    address: lobby, abi: VoteLobbyABI, functionName: 'voteStartTime',
    query: { enabled: phase !== undefined && Number(phase) === 1 },
  })
  const { data: revealDeadline } = useReadContract({
    address: lobby, abi: VoteLobbyABI, functionName: 'revealDeadline',
    query: { enabled: phase !== undefined && Number(phase) === 2 },
  })

  const optCount = optionCount !== undefined ? Number(optionCount) : 0
  const { data: tallyResults } = useReadContracts({
    contracts: Array.from({ length: optCount }, (_, i) => ({
      address: lobby,
      abi: VoteLobbyABI,
      functionName: 'getVoteTally' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: phase !== undefined && Number(phase) === 3 },
  })

  const { writeContract, loading, toast, dismissToast } = useTxFeedback()
  const { writeContractAsync } = useWriteContract()

  const [showDetails, setShowDetails] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [hasCommitted, setHasCommitted] = useState(false)
  const [optimisticVote, setOptimisticVote] = useState<number | null>(null)
  const autoRevealStarted = useRef(false)
  const [revealDone, setRevealDone] = useState(false)

  const phaseIdx = phase !== undefined ? Number(phase) : 0
  const isOwner = userAddr && owner && userAddr.toLowerCase() === owner.toLowerCase()
  const memCount = memberCount !== undefined ? Number(memberCount) : 0

  const vDuration = voteDuration !== undefined ? Number(voteDuration) : 0
  const vStart = voteStartTime !== undefined ? Number(voteStartTime) : 0
  const voteDeadline = vStart > 0 ? vStart + vDuration : undefined
  const revealDl = revealDeadline !== undefined ? Number(revealDeadline) : undefined

  // Onceden commit edilmis oyu yukle
  useEffect(() => {
    const saved = loadVoteCommit(lobby)
    if (saved) {
      setHasCommitted(true)
      setOptimisticVote(Number(saved.option))
    }
  }, [lobby])

  // REVEAL phase — otomatik reveal
  useEffect(() => {
    if (phaseIdx !== 2 || !isMember || !userAddr || autoRevealStarted.current) return
    const saved = loadVoteCommit(lobby)
    if (!saved) return

    autoRevealStarted.current = true
    ;(async () => {
      try {
        await writeContractAsync({
          address: lobby,
          abi: VoteLobbyABI,
          functionName: 'revealVote',
          args: [BigInt(saved.option), saved.salt as `0x${string}`],
        })
        setRevealDone(true)
      } catch {
        // Zaten reveal edilmis olabilir
        setRevealDone(true)
      }
    })()
  }, [phaseIdx, isMember, userAddr, lobby, writeContractAsync])

  const handleJoin = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'joinLobby' })
  const handleStartVoting = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'startVoting' })
  const handleEndVoting = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'endVoting' })
  const handleFinish = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'finishVoting' })
  const handleWithdraw = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'withdrawStake' })

  const handleVote = (optionIndex: number) => {
    if (hasCommitted) return
    // Optimistic
    setOptimisticVote(optionIndex)
    setHasCommitted(true)

    const salt = generateRandomBytes32()
    const commitment = keccak256(encodePacked(['uint256', 'bytes32'], [BigInt(optionIndex), salt as `0x${string}`]))
    saveVoteCommit(lobby, { option: String(optionIndex), salt })
    writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'commitVote', args: [commitment] })
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">{(lobbyName as string) || 'Oylama'}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PHASE_BG[phaseIdx]} ${PHASE_COLORS[phaseIdx]}`}>
          {PHASE_LABELS[phaseIdx]}
        </span>
        {isOwner && <span className="rounded-full bg-purple-900/50 px-3 py-1 text-xs text-purple-300">Yonetici</span>}
        {isMember && !isOwner && <span className="rounded-full bg-green-900/50 px-3 py-1 text-xs text-green-300">Katilimci</span>}
      </div>

      {/* Compact info */}
      <div className="mb-6 flex items-center gap-4 flex-wrap text-sm text-gray-400">
        <span>{memCount} katilimci</span>
        <span className="text-gray-700">|</span>
        <span>{optCount} secenek</span>
        {phaseIdx === 1 && (
          <>
            <span className="text-gray-700">|</span>
            <CountdownTimer deadline={voteDeadline} label="" />
          </>
        )}
        {phaseIdx === 2 && revealDl && (
          <>
            <span className="text-gray-700">|</span>
            <CountdownTimer deadline={revealDl} label="Kalan:" />
          </>
        )}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition"
        >
          {showDetails ? 'Gizle' : 'Detaylar'}
        </button>
      </div>

      {showDetails && (
        <div className="mb-6 grid gap-3 rounded-xl border border-gray-800/50 bg-gray-900/50 p-4 sm:grid-cols-3 animate-fade-in-up text-xs">
          <Info label="Kontrat" value={`${lobby.slice(0, 6)}...${lobby.slice(-4)}`} mono />
          <Info label="Oylama Suresi" value={voteDuration !== undefined ? formatDuration(Number(voteDuration)) : '...'} />
          <Info label="Reveal Penceresi" value={revealWindow !== undefined ? formatDuration(Number(revealWindow)) : '...'} />
          <Info label="Stake" value={stake !== undefined ? `${formatEther(stake)} MON` : '...'} />
          <Info label="Reveal" value={totalRevealed !== undefined ? String(Number(totalRevealed)) : '0'} />
          <div>
            <button onClick={() => setShowMembers(!showMembers)} className="text-gray-500 hover:text-gray-300 transition">
              {showMembers ? 'Gizle' : `${memCount} uye`}
            </button>
          </div>
        </div>
      )}

      {showDetails && showMembers && memCount > 0 && (
        <div className="mb-4 animate-fade-in-up">
          <MemberList lobbyAddress={lobby} memberCount={memCount} owner={owner as string} abi={VoteLobbyABI as unknown as import('viem').Abi} />
        </div>
      )}

      <div className="space-y-4">
        {/* PENDING */}
        {phaseIdx === 0 && (
          <WalletGuard fallbackMessage="Katilmak icin cuzdan bagla.">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 animate-fade-in-up">
              {!isMember && !isOwner && (
                <div className="text-center">
                  <div className="mb-4 text-5xl">🗳️</div>
                  <h2 className="mb-2 text-lg font-semibold text-white">Oylamaya Katil</h2>
                  <p className="mb-4 text-sm text-gray-400">
                    {memCount > 0 ? `${memCount} kisi katildi` : 'Ilk katilimci sen ol!'}
                  </p>
                  <ActionButton onClick={handleJoin} loading={loading} size="lg">Katil</ActionButton>
                </div>
              )}
              {isMember && (
                <div className="text-center animate-fade-in">
                  <div className="mb-3 text-4xl">✅</div>
                  <p className="text-green-300 font-medium">Hazirsin!</p>
                  <p className="text-sm text-gray-500 mt-1">Oylama basladiginda secenekler burada gorunecek.</p>
                </div>
              )}
              {isOwner && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <ActionButton onClick={handleStartVoting} loading={loading} size="lg" fullWidth>
                    Oylamayi Baslat ({memCount} katilimci)
                  </ActionButton>
                </div>
              )}
            </div>
          </WalletGuard>
        )}

        {/* VOTING */}
        {phaseIdx === 1 && (
          <div className="space-y-4">
            {isMember && (
              <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 p-6 animate-scale-in">
                {hasCommitted ? (
                  <div className="text-center py-4 animate-fade-in">
                    <div className="text-5xl mb-3 animate-check-pop">✅</div>
                    <p className="text-green-300 font-semibold text-lg">Oyun gonderildi!</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Secenek {optimisticVote !== null ? optimisticVote + 1 : '?'} sectin.
                    </p>
                  </div>
                ) : (
                  <>
                    <h2 className="mb-4 text-lg font-semibold text-white">Oyunu sec</h2>
                    <div className={`grid gap-3 stagger-children ${optCount <= 3 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {Array.from({ length: optCount }, (_, i) => {
                        const s = VOTE_STYLES[i % VOTE_STYLES.length]
                        return (
                          <button
                            key={i}
                            onClick={() => handleVote(i)}
                            disabled={loading}
                            className={`${s.bg} ${s.hover} rounded-xl px-5 py-5 text-white font-bold text-base flex items-center gap-3 transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            <span className="text-2xl">{s.emoji}</span>
                            <span>Secenek {i + 1}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {!isMember && !isOwner && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-900/50 p-5 text-center animate-fade-in">
                <p className="text-sm text-gray-500">Oylamayi izliyorsun.</p>
              </div>
            )}

            {isOwner && (
              <WalletGuard>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between animate-fade-in-up">
                  <p className="text-sm text-gray-400">Oylama suresi dolduysa reveal'a gec.</p>
                  <ActionButton onClick={handleEndVoting} loading={loading}>Oylamayi Bitir</ActionButton>
                </div>
              </WalletGuard>
            )}
          </div>
        )}

        {/* REVEAL */}
        {phaseIdx === 2 && (
          <div className="space-y-4 animate-fade-in-up">
            {isMember && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                {revealDone ? (
                  <div className="flex items-center gap-3 animate-fade-in">
                    <span className="text-green-400 animate-check-pop">✓</span>
                    <p className="text-sm text-green-300 font-medium">Oyun aciklandi!</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                    <p className="text-sm text-gray-400">Oyun otomatik aciklaniyor...</p>
                  </div>
                )}
              </div>
            )}

            <WalletGuard>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
                <p className="text-sm text-gray-400">Reveal suresi dolduysa oylamayi sonlandir.</p>
                <ActionButton onClick={handleFinish} loading={loading}>Sonlandir</ActionButton>
              </div>
            </WalletGuard>
          </div>
        )}

        {/* FINISHED */}
        {phaseIdx === 3 && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="mb-5 text-lg font-semibold text-white">Sonuclar</h2>
              <div className="space-y-3 stagger-children">
                {tallyResults?.map((result, i) => {
                  const votes = result.status === 'success' ? Number(result.result) : 0
                  const total = totalRevealed !== undefined ? Number(totalRevealed) : 0
                  const pct = total > 0 ? ((votes / total) * 100) : 0
                  const s = VOTE_STYLES[i % VOTE_STYLES.length]
                  const isWinner = tallyResults.every((r, j) =>
                    j === i || (r.status === 'success' ? Number(r.result) : 0) <= votes
                  ) && votes > 0
                  return (
                    <div key={i} className={`flex items-center gap-3 rounded-xl p-3 transition-all ${isWinner ? 'bg-purple-900/20 border border-purple-700/30' : 'bg-gray-800/40'}`}>
                      <span className="text-xl">{s.emoji}</span>
                      <span className="w-20 text-sm text-gray-300 font-medium">Secenek {i + 1}</span>
                      <div className="flex-1 rounded-full bg-gray-800 h-4 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out animate-progress-fill ${isWinner ? 'bg-purple-500' : 'bg-gray-600'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-sm text-gray-300 font-medium">
                        {votes} oy ({pct.toFixed(0)}%)
                      </span>
                      {isWinner && <span className="text-yellow-400">🏆</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {isOwner && (
              <WalletGuard>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
                  <p className="text-sm text-gray-400">Stake'ini geri cek.</p>
                  <ActionButton onClick={handleWithdraw} loading={loading}>Stake Cek</ActionButton>
                </div>
              </WalletGuard>
            )}
          </div>
        )}
      </div>

      <TxToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-600 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-300 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function ActionButton({ onClick, loading, children, variant = 'primary', size = 'md', fullWidth = false }: {
  onClick: () => void; loading: boolean; children: React.ReactNode; variant?: 'primary' | 'danger'; size?: 'md' | 'lg'; fullWidth?: boolean
}) {
  const colors = variant === 'danger'
    ? 'bg-red-600/80 hover:bg-red-500 text-red-100'
    : 'bg-purple-600 hover:bg-purple-500 hover:shadow-purple-500/20 hover:shadow-lg text-white'
  const sizeClass = size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm'
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded-xl font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${colors} ${sizeClass} ${fullWidth ? 'w-full' : ''}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          Isleniyor...
        </span>
      ) : children}
    </button>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}dk ${s}s` : `${m}dk`
}
