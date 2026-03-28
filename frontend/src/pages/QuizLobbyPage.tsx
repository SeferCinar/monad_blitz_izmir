import { useParams } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { formatEther, type Address, keccak256, encodePacked } from 'viem'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTxFeedback } from '../hooks/useTxFeedback'
import { useQuizEvents } from '../hooks/useContractEvents'
import WalletGuard from '../components/WalletGuard'
import TxToast from '../components/TxToast'
import SaltInput from '../components/SaltInput'
import CountdownTimer from '../components/CountdownTimer'
import MemberList from '../components/MemberList'
import QuestionDisplay from '../components/QuestionDisplay'

const PHASE_LABELS = ['Beklemede', 'Aktif', 'Reveal', 'Bitti'] as const
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const

export default function QuizLobbyPage() {
  const { address: lobbyAddr } = useParams<{ address: string }>()
  const lobby = lobbyAddr as Address
  const { address: userAddr } = useAuth()

  // Event dinleme — real-time guncelleme
  useQuizEvents(lobby)

  const { data: owner } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'owner' })
  const { data: phase } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'phase' })
  const { data: questionCount } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'questionCount' })
  const { data: currentQuestion } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'currentQuestion' })
  const { data: questionDuration } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'questionDuration' })
  const { data: revealWindow } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'revealWindow' })
  const { data: stake } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'stake' })
  const { data: memberCount } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'memberCount' })
  const { data: isMember } = useReadContract({
    address: lobby, abi: QuizLobbyABI, functionName: 'isMember', args: userAddr ? [userAddr] : undefined,
    query: { enabled: !!userAddr },
  })
  const { data: revealDeadline } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'revealDeadline' })

  // Aktif sorunun baslangic zamani (timer icin)
  const curQ = currentQuestion !== undefined ? Number(currentQuestion) : 0
  const { data: questionStartTime } = useReadContract({
    address: lobby, abi: QuizLobbyABI, functionName: 'questionStartTime',
    args: [BigInt(curQ)],
    query: { enabled: phase !== undefined && Number(phase) === 1 },
  })

  const { writeContract, loading, toast, dismissToast } = useTxFeedback()

  const [answer, setAnswer] = useState('')
  const [salt, setSalt] = useState('')
  const [revealKey, setRevealKey] = useState('')
  const [revealSalts, setRevealSalts] = useState<Record<number, { answer: string; salt: string }>>({})
  const [showMembers, setShowMembers] = useState(false)

  const phaseIdx = phase !== undefined ? Number(phase) : 0
  const isOwner = userAddr && owner && userAddr.toLowerCase() === owner.toLowerCase()
  const memCount = memberCount !== undefined ? Number(memberCount) : 0
  const qDuration = questionDuration !== undefined ? Number(questionDuration) : 0
  const qStartTime = questionStartTime !== undefined ? Number(questionStartTime) : 0
  const questionDeadline = qStartTime > 0 ? qStartTime + qDuration : undefined

  const handleJoin = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'joinLobby' })
  const handleStart = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'startQuiz' })

  const handleCommitAnswer = () => {
    if (!answer || !salt || currentQuestion === undefined) return
    const commitment = keccak256(encodePacked(['string', 'bytes32'], [answer, salt as `0x${string}`]))
    // Commit'i kaydet (reveal icin lazim)
    setRevealSalts((prev) => ({ ...prev, [Number(currentQuestion)]: { answer, salt } }))
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
    const saved = revealSalts[qIdx]
    const a = saved?.answer || answer
    const s = saved?.salt || salt
    if (!a || !s) return
    writeContract({
      address: lobby, abi: QuizLobbyABI, functionName: 'revealAnswer',
      args: [BigInt(qIdx), a, s as `0x${string}`],
    })
  }

  const handleFinish = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'finishQuiz' })
  const handleClaimSlash = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'claimSlashedStake' })

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Quiz Lobisi</h1>
        <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${PHASE_COLORS[phaseIdx]}`}>
          {PHASE_LABELS[phaseIdx]}
        </span>
        {isOwner && <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">Owner</span>}
        {isMember && !isOwner && <span className="rounded-md bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Uye</span>}

        {/* Active phase timer */}
        {phaseIdx === 1 && <CountdownTimer deadline={questionDeadline} label="Soru suresi:" />}
        {/* Reveal phase timer */}
        {phaseIdx === 2 && revealDeadline !== undefined && Number(revealDeadline) > 0 && (
          <CountdownTimer deadline={Number(revealDeadline)} label="Reveal suresi:" />
        )}
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
        <Info label="Uye Sayisi" value={memCount.toString()} />
      </div>

      {/* Member list toggle */}
      <div className="mb-4">
        <button
          onClick={() => setShowMembers(!showMembers)}
          className="text-sm text-gray-400 hover:text-gray-200"
        >
          {showMembers ? 'Uye listesini gizle' : `Uyeleri goster (${memCount})`}
        </button>
        {showMembers && memCount > 0 && (
          <div className="mt-2">
            <MemberList lobbyAddress={lobby} memberCount={memCount} owner={owner as string} />
          </div>
        )}
      </div>

      {/* Actions by phase */}
      <div className="space-y-4">
        {/* PENDING */}
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
            {/* Question display */}
            <QuestionDisplay lobbyAddress={lobby} questionIndex={curQ > 0 ? curQ - 1 : 0} />

            {/* Reveal Key */}
            <WalletGuard fallbackMessage="Soru anahtari acmak icin cuzdan bagla.">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">
                  Soru {curQ} Anahtari Ac
                  <span className="ml-2 text-sm font-normal text-gray-500">(herkes cagirabillir)</span>
                </h2>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="0x... (bytes32 key)"
                    value={revealKey} onChange={(e) => setRevealKey(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                  <ActionButton onClick={handleRevealKey} loading={loading}>Anahtar Ac</ActionButton>
                </div>
              </div>
            </WalletGuard>

            {/* Commit Answer */}
            {isMember && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">Cevap Gonder (commit)</h2>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Cevabin</label>
                    <input
                      type="text" placeholder="orn: A"
                      value={answer} onChange={(e) => setAnswer(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <SaltInput value={salt} onChange={setSalt} />
                </div>
                <ActionButton onClick={handleCommitAnswer} loading={loading}>Commit Et</ActionButton>
                <p className="mt-2 text-xs text-yellow-400">Salt'ini kaydet! Reveal asamasinda lazim olacak.</p>
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

                {/* Kayitli commit'ler varsa onlari goster */}
                {Object.keys(revealSalts).length > 0 && (
                  <div className="mb-4 rounded-lg bg-gray-800/50 p-3">
                    <p className="mb-2 text-xs text-gray-500">Kayitli commit'lerin (bu oturumdan):</p>
                    {Object.entries(revealSalts).map(([qIdx, data]) => (
                      <div key={qIdx} className="flex items-center gap-2 text-xs text-gray-400">
                        <span>Soru {qIdx}:</span>
                        <span className="font-mono">{data.answer}</span>
                        <ActionButton onClick={() => handleRevealAnswer(Number(qIdx))} loading={loading}>
                          Reveal
                        </ActionButton>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manuel reveal */}
                <p className="mb-2 text-xs text-gray-500">Veya manuel gir:</p>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Cevabin</label>
                    <input
                      type="text" placeholder="Commit ettiigin cevap"
                      value={answer} onChange={(e) => setAnswer(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <SaltInput value={salt} onChange={setSalt} label="Commit Salt" />
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
            <p className="mb-2 text-lg text-gray-400">Quiz tamamlandi.</p>
            <p className="text-sm text-gray-500">ScoreBoard deploy edildiyse skorlari gorebilirsin.</p>
          </div>
        )}

        {/* Slash claim */}
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
