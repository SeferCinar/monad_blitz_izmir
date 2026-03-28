import { useParams, useSearchParams } from 'react-router-dom'
import { useReadContract, useWriteContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { formatEther, type Address, keccak256, encodePacked } from 'viem'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTxFeedback } from '../hooks/useTxFeedback'
import { useQuizEvents } from '../hooks/useContractEvents'
import WalletGuard from '../components/WalletGuard'
import TxToast from '../components/TxToast'
import CountdownTimer from '../components/CountdownTimer'
import MemberList from '../components/MemberList'
import QuestionDisplay from '../components/QuestionDisplay'
import { generateRandomBytes32, generateQuizKeys } from '../lib/crypto'
import { loadQuizSession, saveAnswerCommit, loadAnswerCommits, markRevealed, saveCid, loadCid } from '../lib/session'

const PHASE_LABELS = ['Beklemede', 'Aktif', 'Reveal', 'Bitti'] as const
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const

// Kahoot cevap buton renkleri ve sekilleri
const ANSWER_STYLES = [
  { bg: 'bg-red-600 hover:bg-red-500',    shape: '▲', border: 'border-red-400' },
  { bg: 'bg-blue-600 hover:bg-blue-500',  shape: '◆', border: 'border-blue-400' },
  { bg: 'bg-yellow-500 hover:bg-yellow-400', shape: '●', border: 'border-yellow-300' },
  { bg: 'bg-green-600 hover:bg-green-500', shape: '■', border: 'border-green-400' },
]

export default function QuizLobbyPage() {
  const { address: lobbyAddr } = useParams<{ address: string }>()
  const [searchParams] = useSearchParams()
  const lobby = lobbyAddr as Address
  const cidFromUrl = searchParams.get('cid') || ''
  const ipfsCid = cidFromUrl || loadCid(lobby)
  const { address: userAddr } = useAuth()

  // URL'den CID geliyorsa localStorage'a kaydet (sonraki girislerde de kullanilsin)
  useEffect(() => {
    if (cidFromUrl) saveCid(lobby, cidFromUrl)
  }, [cidFromUrl, lobby])

  useQuizEvents(lobby)

  const { data: owner }           = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'owner' })
  const { data: phase }           = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'phase' })
  const { data: questionCount }   = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'questionCount' })
  const { data: currentQuestion } = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'currentQuestion' })
  const { data: questionDuration }= useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'questionDuration' })
  const { data: revealWindow }    = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'revealWindow' })
  const { data: stake }           = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'stake' })
  const { data: memberCount }     = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'memberCount' })
  const { data: isMember }        = useReadContract({
    address: lobby, abi: QuizLobbyABI, functionName: 'isMember',
    args: userAddr ? [userAddr] : undefined,
    query: { enabled: !!userAddr },
  })
  const { data: revealDeadline }  = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'revealDeadline' })

  const curQ = currentQuestion !== undefined ? Number(currentQuestion) : 0
  const { data: questionStartTime } = useReadContract({
    address: lobby, abi: QuizLobbyABI, functionName: 'questionStartTime',
    args: [BigInt(curQ > 0 ? curQ - 1 : 0)],
    query: { enabled: phase !== undefined && Number(phase) === 1 },
  })

  // Temel tx feedback (join, start, finish, slash)
  const { writeContract, loading, toast, dismissToast } = useTxFeedback()

  // Auto-reveal icin ayri writeContract (sirayla tx gonderebilmek icin)
  const { writeContractAsync } = useWriteContract()

  const [showMembers, setShowMembers] = useState(false)
  const [committedQuestions, setCommittedQuestions] = useState<Set<number>>(new Set())
  const [revealProgress, setRevealProgress] = useState<{ done: number; total: number } | null>(null)
  const autoRevealStarted = useRef(false)

  const phaseIdx = phase !== undefined ? Number(phase) : 0
  const isOwner  = userAddr && owner && userAddr.toLowerCase() === owner.toLowerCase()
  const memCount = memberCount !== undefined ? Number(memberCount) : 0
  const qCount   = questionCount !== undefined ? Number(questionCount) : 0
  const qDuration  = questionDuration !== undefined ? Number(questionDuration) : 0
  const qStartTime = questionStartTime !== undefined ? Number(questionStartTime) : 0
  const displayedQ = curQ > 0 ? curQ - 1 : 0
  const questionDeadline = qStartTime > 0 ? qStartTime + qDuration : undefined

  // CID'yi cache'le — participant'lar URL param olmadan girebilir
  useEffect(() => {
    if (ipfsCid) saveCid(lobby, ipfsCid)
  }, [ipfsCid, lobby])

  const effectiveCid = ipfsCid || loadCid(lobby)

  // Daha once commit edilmis sorulari yukle
  useEffect(() => {
    const commits = loadAnswerCommits(lobby)
    setCommittedQuestions(new Set(Object.keys(commits).map(Number)))
  }, [lobby])

  // REVEAL phase'e gecinince cevaplari otomatik gonder
  useEffect(() => {
    if (phaseIdx !== 2 || !isMember || !userAddr || autoRevealStarted.current) return
    const commits = loadAnswerCommits(lobby)
    const pending = Object.entries(commits).filter(([, c]) => !c.revealed)
    if (pending.length === 0) return

    autoRevealStarted.current = true
    setRevealProgress({ done: 0, total: pending.length })

    ;(async () => {
      let done = 0
      for (const [qIdxStr, commit] of pending) {
        const qIdx = Number(qIdxStr)
        try {
          const hash = await writeContractAsync({
            address: lobby,
            abi: QuizLobbyABI,
            functionName: 'revealAnswer',
            args: [BigInt(qIdx), commit.answer, commit.salt as `0x${string}`],
          })
          // Tx gonderildi, onay beklemeye gerek yok — bir sonrakine gec
          void hash
          markRevealed(lobby, qIdx)
          done++
          setRevealProgress({ done, total: pending.length })
        } catch {
          // Zaten reveal edilmisse veya basarisizsa atla
          done++
          setRevealProgress({ done, total: pending.length })
        }
      }
    })()
  }, [phaseIdx, isMember, userAddr, lobby, writeContractAsync])

  // --- Handler'lar ---

  const handleJoin  = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'joinLobby' })
  const handleStart = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'startQuiz' })
  const handleFinish = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'finishQuiz' })
  const handleClaimSlash = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'claimSlashedStake' })

  // Owner: sıradaki sorunun anahtarını otomatik derive edip reveal et
  const handleRevealNextKey = async () => {
    const session = loadQuizSession(lobby)
    if (!session?.masterKey) return
    const keys = await generateQuizKeys(session.masterKey, qCount)
    const keyToReveal = keys[curQ]
    if (!keyToReveal) return
    writeContract({
      address: lobby,
      abi: QuizLobbyABI,
      functionName: 'revealKey',
      args: [BigInt(curQ), keyToReveal.hex],
    })
  }

  // Participant: secenege tiklayinca otomatik salt uret ve commit et
  const handleAnswerClick = (option: string) => {
    if (committedQuestions.has(displayedQ)) return  // zaten commit edildi
    const salt = generateRandomBytes32()
    const commitment = keccak256(encodePacked(['string', 'bytes32'], [option, salt as `0x${string}`]))
    saveAnswerCommit(lobby, displayedQ, { answer: option, salt })
    setCommittedQuestions((prev) => new Set(prev).add(displayedQ))
    writeContract({
      address: lobby,
      abi: QuizLobbyABI,
      functionName: 'commitAnswer',
      args: [BigInt(displayedQ), commitment],
    })
  }

  const hasCommitted = committedQuestions.has(displayedQ)
  const savedAnswer  = loadAnswerCommits(lobby)[displayedQ]?.answer

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Quiz Lobisi</h1>
        <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${PHASE_COLORS[phaseIdx]}`}>
          {PHASE_LABELS[phaseIdx]}
        </span>
        {isOwner && <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">Owner</span>}
        {isMember && !isOwner && <span className="rounded-md bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Uye</span>}
        {phaseIdx === 1 && <CountdownTimer deadline={questionDeadline} label="Soru suresi:" />}
        {phaseIdx === 2 && revealDeadline !== undefined && Number(revealDeadline) > 0 && (
          <CountdownTimer deadline={Number(revealDeadline)} label="Reveal suresi:" />
        )}
      </div>

      {/* Info Grid */}
      <div className="mb-6 grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 sm:grid-cols-3">
        <Info label="Adres" value={lobby} mono />
        <Info label="Owner" value={owner ? `${(owner as string).slice(0, 8)}...${(owner as string).slice(-6)}` : '...'} mono />
        <Info label="Soru Sayisi" value={qCount > 0 ? String(qCount) : '...'} />
        <Info label="Aktif Soru" value={`${displayedQ + 1} / ${qCount || '?'}`} />
        <Info label="Soru Suresi" value={questionDuration !== undefined ? formatDuration(Number(questionDuration)) : '...'} />
        <Info label="Reveal Penceresi" value={revealWindow !== undefined ? formatDuration(Number(revealWindow)) : '...'} />
        <Info label="Stake" value={stake !== undefined ? `${formatEther(stake)} MON` : '...'} />
        <Info label="Uye Sayisi" value={memCount.toString()} />
      </div>

      {/* Member list toggle */}
      <div className="mb-4">
        <button onClick={() => setShowMembers(!showMembers)} className="text-sm text-gray-400 hover:text-gray-200">
          {showMembers ? 'Uye listesini gizle' : `Uyeleri goster (${memCount})`}
        </button>
        {showMembers && memCount > 0 && (
          <div className="mt-2">
            <MemberList lobbyAddress={lobby} memberCount={memCount} owner={owner as string} />
          </div>
        )}
      </div>

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
            {/* Soru goster */}
            <QuestionDisplay lobbyAddress={lobby} questionIndex={displayedQ} ipfsCid={effectiveCid} />

            {/* Owner: sonraki soruya gec */}
            {isOwner && (
              <WalletGuard>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <h2 className="mb-2 text-lg font-semibold text-white">
                    {curQ < qCount ? `Soru ${curQ + 1}'i Ac` : 'Soruyu Bitir'}
                  </h2>
                  <p className="mb-3 text-sm text-gray-400">
                    Butona basinca sıradaki sorunun anahtarı otomatik acilir.
                  </p>
                  <ActionButton onClick={handleRevealNextKey} loading={loading}>
                    {curQ < qCount ? `▶ Soru ${curQ + 1}'e Gec` : '✓ Sorulari Bitir'}
                  </ActionButton>
                </div>
              </WalletGuard>
            )}

            {/* Participant: Kahoot cevap butonlari */}
            {isMember && !isOwner && (
              <WalletGuard>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  {hasCommitted ? (
                    <div className="text-center py-4">
                      <div className="text-4xl mb-2">✅</div>
                      <p className="text-green-300 font-semibold">
                        Cevabın gönderildi: <span className="font-bold">{savedAnswer}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Siradaki soruyu bekle...</p>
                    </div>
                  ) : (
                    <AnswerButtons onAnswer={handleAnswerClick} loading={loading} lobbyAddress={lobby} questionIndex={displayedQ} ipfsCid={effectiveCid} />
                  )}
                </div>
              </WalletGuard>
            )}

            {!isMember && !isOwner && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-900/50 p-5 text-center">
                <p className="text-sm text-gray-500">Bu lobinin uyesi degilsin. Sadece izleyebilirsin.</p>
              </div>
            )}

            {/* Slash */}
            {isMember && (
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
        )}

        {/* REVEAL */}
        {phaseIdx === 2 && (
          <div className="space-y-4">
            {isMember && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">Cevaplar Gonderiliyor...</h2>
                {revealProgress ? (
                  <div>
                    <div className="mb-2 h-3 w-full rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-600 transition-all duration-300"
                        style={{ width: `${(revealProgress.done / revealProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-400">{revealProgress.done} / {revealProgress.total} cevap gonderildi</p>
                    {revealProgress.done === revealProgress.total && (
                      <p className="mt-2 text-sm text-green-400">✓ Tum cevaplar gonderildi!</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Cevaplar otomatik gonderilecek...</p>
                )}
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
      </div>

      <TxToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

// Kahoot tarzı cevap butonlari — soruyu bekler, secenekleri gosterir
function AnswerButtons({
  onAnswer, loading, lobbyAddress, questionIndex, ipfsCid
}: {
  onAnswer: (opt: string) => void
  loading: boolean
  lobbyAddress: Address
  questionIndex: number
  ipfsCid: string
}) {
  const [options, setOptions] = useState<string[]>([])
  const { data: revealedKey } = useReadContract({
    address: lobbyAddress, abi: QuizLobbyABI, functionName: 'revealedKeys',
    args: [BigInt(questionIndex)],
  })

  // IPFS'ten secenekleri al (sifre cozulunce)
  useEffect(() => {
    const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'
    if (!revealedKey || revealedKey === ZERO || !ipfsCid) return
    import('../lib/ipfs').then(({ fetchFromIpfs }) =>
      fetchFromIpfs(ipfsCid).then((data) => {
        const q = data.questions.find((q) => q.index === questionIndex)
        if (!q) return
        import('../lib/crypto').then(({ hexToKey, decryptAesGcm }) => {
          const key = hexToKey(revealedKey)
          decryptAesGcm(q.encryptedPayload, q.iv, key).then((text) => {
            const parsed = JSON.parse(text)
            setOptions(parsed.options ?? [])
          }).catch(() => {})
        })
      }).catch(() => {})
    )
  }, [revealedKey, ipfsCid, questionIndex])

  const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'
  if (!revealedKey || revealedKey === ZERO) {
    return (
      <div className="text-center py-6">
        <div className="text-3xl mb-2 animate-pulse">⏳</div>
        <p className="text-gray-500 text-sm">Soru acılmasını bekle...</p>
      </div>
    )
  }

  if (options.length === 0) {
    return <div className="text-sm text-gray-500 animate-pulse text-center py-4">Secenekler yukleniyor...</div>
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-400 font-medium">Cevabını seç:</p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, i) => {
          const s = ANSWER_STYLES[i % ANSWER_STYLES.length]
          return (
            <button
              key={i}
              onClick={() => onAnswer(opt)}
              disabled={loading}
              className={`${s.bg} rounded-xl px-4 py-5 text-white font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed border-2 border-transparent hover:border-white/30`}
            >
              <span className="text-xl">{s.shape}</span>
              <span className="leading-tight">{opt}</span>
            </button>
          )
        })}
      </div>
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
  const colors = variant === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-purple-600 hover:bg-purple-500'
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
