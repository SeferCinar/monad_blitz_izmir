import { useParams } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { formatEther, type Address, keccak256, encodePacked } from 'viem'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTxFeedback } from '../hooks/useTxFeedback'
import WalletGuard from '../components/WalletGuard'
import TxToast from '../components/TxToast'

const PHASE_LABELS = ['Beklemede', 'Aktif', 'Reveal', 'Bitti'] as const
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const

export default function QuizLobbyPage() {
  const { address: lobbyAddr } = useParams<{ address: string }>()
  const lobby = lobbyAddr as Address
  const { address: userAddr } = useAuth()

  const { data: owner } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'owner' })
  const { data: phase, refetch: refetchPhase } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'phase' })
  const { data: questionCount } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'questionCount' })
  const { data: currentQuestion, refetch: refetchCurrent } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'currentQuestion' })
  const { data: questionDuration } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'questionDuration' })
  const { data: revealWindow } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'revealWindow' })
  const { data: stake } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'stake' })
  const { data: memberCount, refetch: refetchMembers } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'memberCount' })
  const { data: isMember, refetch: refetchIsMember } = useReadContract({
    address: lobby, abi: QuizLobbyABI, functionName: 'isMember', args: userAddr ? [userAddr] : undefined,
    query: { enabled: !!userAddr },
  })
  const { data: revealDeadline } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'revealDeadline' })

  const { writeContract, loading, toast, dismissToast, status } = useTxFeedback()

  const [answer, setAnswer] = useState('')
  const [salt, setSalt] = useState('')
  const [revealKey, setRevealKey] = useState('')

  const phaseIdx = phase !== undefined ? Number(phase) : 0
  const isOwner = userAddr && owner && userAddr.toLowerCase() === owner.toLowerCase()

  // Refetch after successful tx
  if (status === 'success') {
    refetchPhase()
    refetchCurrent()
    refetchMembers()
    refetchIsMember()
  }

  const handleJoin = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'joinLobby' })
  const handleStart = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'startQuiz' })

  const handleCommitAnswer = () => {
    if (!answer || !salt || currentQuestion === undefined) return
    const commitment = keccak256(encodePacked(['string', 'bytes32'], [answer, salt as `0x${string}`]))
    writeContract({
      address: lobby, abi: QuizLobbyABI, functionName: 'commitAnswer',
      args: [BigInt(currentQuestion), commitment],
    })
  }

  const handleRevealKey = () => {
    if (!revealKey || currentQuestion === undefined) return
    writeContract({
      address: lobby, abi: QuizLobbyABI, functionName: 'revealKey',
      args: [BigInt(currentQuestion), revealKey as `0x${string}`],
    })
  }

  const handleRevealAnswer = (qIdx: number) => {
    if (!answer || !salt) return
    writeContract({
      address: lobby, abi: QuizLobbyABI, functionName: 'revealAnswer',
      args: [BigInt(qIdx), answer, salt as `0x${string}`],
    })
  }

  const handleFinish = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'finishQuiz' })
  const handleClaimSlash = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'claimSlashedStake' })

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Quiz Lobisi</h1>
        <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${PHASE_COLORS[phaseIdx]}`}>
          {PHASE_LABELS[phaseIdx]}
        </span>
        {isOwner && <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">Owner</span>}
        {isMember && !isOwner && <span className="rounded-md bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Uye</span>}
      </div>

      {/* Info Grid */}
      <div className="mb-6 grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 sm:grid-cols-3">
        <Info label="Adres" value={lobby} mono />
        <Info label="Owner" value={owner ? `${(owner as string).slice(0, 8)}...${(owner as string).slice(-6)}` : '...'} mono />
        <Info label="Soru Sayisi" value={questionCount !== undefined ? String(Number(questionCount)) : '...'} />
        <Info label="Aktif Soru" value={currentQuestion !== undefined ? `${Number(currentQuestion)} / ${questionCount !== undefined ? Number(questionCount) : '?'}` : '...'} />
        <Info label="Soru Suresi" value={questionDuration !== undefined ? formatDuration(Number(questionDuration)) : '...'} />
        <Info label="Reveal Penceresi" value={revealWindow !== undefined ? formatDuration(Number(revealWindow)) : '...'} />
        <Info label="Stake" value={stake !== undefined ? `${formatEther(stake)} MON` : '...'} />
        <Info label="Uye Sayisi" value={memberCount !== undefined ? String(Number(memberCount)) : '...'} />
        {revealDeadline !== undefined && Number(revealDeadline) > 0 && (
          <Info label="Reveal Deadline" value={new Date(Number(revealDeadline) * 1000).toLocaleString('tr-TR')} />
        )}
      </div>

      {/* Actions */}
      <div className="space-y-4">
        {/* PENDING: Join & Start */}
        {phaseIdx === 0 && (
          <WalletGuard fallbackMessage="Lobiye katilmak veya quiz baslatmak icin cuzdan bagla.">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Islemler</h2>

              {!isMember && !isOwner && (
                <div className="mb-3">
                  <p className="mb-2 text-sm text-gray-400">Bu lobiye katilmak ister misin?</p>
                  <ActionButton onClick={handleJoin} loading={loading}>Lobiye Katil</ActionButton>
                </div>
              )}

              {isMember && (
                <div className="flex items-center gap-2 rounded-lg bg-green-900/20 border border-green-800/30 px-4 py-2.5">
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                  <p className="text-sm text-green-300">Bu lobinin uyesisin. Quiz'in baslamasini bekliyorsun.</p>
                </div>
              )}

              {isOwner && (
                <div className="mt-3">
                  <p className="mb-2 text-sm text-gray-400">Uyeler hazir oldugunda quiz'i baslat.</p>
                  <ActionButton onClick={handleStart} loading={loading}>Quiz'i Baslat</ActionButton>
                </div>
              )}
            </div>
          </WalletGuard>
        )}

        {/* ACTIVE */}
        {phaseIdx === 1 && (
          <div className="space-y-4">
            <WalletGuard fallbackMessage="Soru anahtari acmak icin cuzdan bagla.">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">
                  Soru Anahtari Ac
                  <span className="ml-2 text-sm font-normal text-gray-500">(herkes cagirabillir)</span>
                </h2>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="0x... (bytes32 key)"
                    value={revealKey} onChange={(e) => setRevealKey(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                  <ActionButton onClick={handleRevealKey} loading={loading}>Anahtar Ac</ActionButton>
                </div>
              </div>
            </WalletGuard>

            {isMember && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">Cevap Gonder (commit)</h2>
                <div className="mb-2 flex gap-2">
                  <input
                    type="text" placeholder="Cevabin (orn: A)"
                    value={answer} onChange={(e) => setAnswer(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                  <input
                    type="text" placeholder="Salt (0x... bytes32)"
                    value={salt} onChange={(e) => setSalt(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <ActionButton onClick={handleCommitAnswer} loading={loading}>Commit Et</ActionButton>
              </div>
            )}

            {!isMember && !isOwner && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-900/50 p-5 text-center">
                <p className="text-sm text-gray-500">Bu lobinin uyesi degilsin. Sadece izleyebilirsin.</p>
              </div>
            )}
          </div>
        )}

        {/* REVEAL */}
        {phaseIdx === 2 && (
          <div className="space-y-4">
            {isMember && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">Cevaplari Ac (reveal)</h2>
                <div className="mb-3 flex gap-2">
                  <input
                    type="text" placeholder="Cevabin"
                    value={answer} onChange={(e) => setAnswer(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                  <input
                    type="text" placeholder="Salt (0x... bytes32)"
                    value={salt} onChange={(e) => setSalt(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {questionCount !== undefined &&
                    Array.from({ length: Number(questionCount) }, (_, i) => (
                      <ActionButton key={i} onClick={() => handleRevealAnswer(i)} loading={loading}>
                        Soru {i}
                      </ActionButton>
                    ))
                  }
                </div>
              </div>
            )}

            <WalletGuard>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
                <p className="text-sm text-gray-400">Reveal suresi dolduysa quiz'i sonlandir.</p>
                <ActionButton onClick={handleFinish} loading={loading}>Quiz'i Bitir</ActionButton>
              </div>
            </WalletGuard>
          </div>
        )}

        {/* FINISHED */}
        {phaseIdx === 3 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-center">
            <p className="text-lg text-gray-400">Quiz tamamlandi.</p>
          </div>
        )}

        {/* Slash claim — visible when ACTIVE but owner didn't reveal keys */}
        {phaseIdx === 1 && isMember && (
          <WalletGuard>
            <div className="rounded-xl border border-red-800/30 bg-red-900/10 p-5">
              <h2 className="mb-2 text-lg font-semibold text-red-300">Stake Talep Et</h2>
              <p className="mb-3 text-sm text-gray-400">
                Owner anahtar acmadiysa ve sure dolduysa, stake'i katilimcilar arasinda dagit.
              </p>
              <ActionButton onClick={handleClaimSlash} loading={loading} variant="danger">
                Stake'i Talep Et
              </ActionButton>
            </div>
          </WalletGuard>
        )}
      </div>

      <TxToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm text-gray-200 ${mono ? 'font-mono break-all' : ''}`}>{value}</p>
    </div>
  )
}

function ActionButton({ onClick, loading, children, variant = 'primary' }: {
  onClick: () => void; loading: boolean; children: React.ReactNode; variant?: 'primary' | 'danger'
}) {
  const colors = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-500'
    : 'bg-purple-600 hover:bg-purple-500'
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${colors}`}
    >
      {loading ? 'Isleniyor...' : children}
    </button>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}dk ${s}s` : `${m}dk`
}
