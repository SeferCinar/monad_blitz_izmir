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
import { useT } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'

const PHASE_KEYS: TranslationKey[] = ['phase.pending', 'phase.active', 'phase.reveal', 'phase.finished']
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const
const PHASE_BG = ['bg-yellow-900/20', 'bg-green-900/20', 'bg-blue-900/20', 'bg-gray-800/50'] as const

const ANSWER_STYLES = [
  { bg: 'bg-red-600', hover: 'hover:bg-red-500 hover:shadow-red-500/20 hover:shadow-lg', shape: '▲', selected: 'ring-2 ring-red-300 bg-red-500' },
  { bg: 'bg-blue-600', hover: 'hover:bg-blue-500 hover:shadow-blue-500/20 hover:shadow-lg', shape: '◆', selected: 'ring-2 ring-blue-300 bg-blue-500' },
  { bg: 'bg-yellow-500', hover: 'hover:bg-yellow-400 hover:shadow-yellow-500/20 hover:shadow-lg', shape: '●', selected: 'ring-2 ring-yellow-300 bg-yellow-400' },
  { bg: 'bg-green-600', hover: 'hover:bg-green-500 hover:shadow-green-500/20 hover:shadow-lg', shape: '■', selected: 'ring-2 ring-green-300 bg-green-500' },
]

export default function QuizLobbyPage() {
  const { address: lobbyAddr } = useParams<{ address: string }>()
  const [searchParams] = useSearchParams()
  const lobby = lobbyAddr as Address
  const cidFromUrl = searchParams.get('cid') || ''
  const ipfsCid = cidFromUrl || loadCid(lobby)
  const { address: userAddr } = useAuth()
  const { t } = useT()

  useEffect(() => {
    if (cidFromUrl) saveCid(lobby, cidFromUrl)
  }, [cidFromUrl, lobby])

  useQuizEvents(lobby)

  const { data: lobbyName }       = useReadContract({ address: lobby, abi: QuizLobbyABI, functionName: 'name' })
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

  const { writeContract, loading, toast, dismissToast } = useTxFeedback()
  const { writeContractAsync } = useWriteContract()

  const [showMembers, setShowMembers] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [committedQuestions, setCommittedQuestions] = useState<Set<number>>(new Set())
  const [optimisticAnswer, setOptimisticAnswer] = useState<string | null>(null)
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

  useEffect(() => {
    if (ipfsCid) saveCid(lobby, ipfsCid)
  }, [ipfsCid, lobby])

  const effectiveCid = ipfsCid || loadCid(lobby)

  useEffect(() => {
    const commits = loadAnswerCommits(lobby)
    setCommittedQuestions(new Set(Object.keys(commits).map(Number)))
  }, [lobby])

  useEffect(() => {
    setOptimisticAnswer(null)
  }, [displayedQ])

  // REVEAL phase — otomatik cevap gonder
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
          void hash
          markRevealed(lobby, qIdx)
          done++
          setRevealProgress({ done, total: pending.length })
        } catch {
          done++
          setRevealProgress({ done, total: pending.length })
        }
      }
    })()
  }, [phaseIdx, isMember, userAddr, lobby, writeContractAsync])

  const handleJoin  = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'joinLobby' })
  const handleStart = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'startQuiz' })
  const handleFinish = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'finishQuiz' })
  const handleClaimSlash = () => writeContract({ address: lobby, abi: QuizLobbyABI, functionName: 'claimSlashedStake' })

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

  const handleAnswerClick = (option: string) => {
    if (committedQuestions.has(displayedQ)) return
    setOptimisticAnswer(option)
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
  const savedAnswer  = optimisticAnswer || loadAnswerCommits(lobby)[displayedQ]?.answer

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">{(lobbyName as string) || t('quiz.title')}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PHASE_BG[phaseIdx]} ${PHASE_COLORS[phaseIdx]}`}>
          {t(PHASE_KEYS[phaseIdx])}
        </span>
        {isOwner && <span className="rounded-full bg-purple-900/50 px-3 py-1 text-xs text-purple-300">{t('common.admin')}</span>}
        {isMember && !isOwner && <span className="rounded-full bg-green-900/50 px-3 py-1 text-xs text-green-300">{t('common.participant')}</span>}
      </div>

      {/* Compact info bar */}
      <div className="mb-6 flex items-center gap-4 flex-wrap text-sm text-gray-400">
        <span>{t('lobby.participants', { count: memCount })}</span>
        <span className="text-gray-700">|</span>
        <span>{t('quiz.questions', { count: qCount })}</span>
        {phaseIdx === 1 && (
          <>
            <span className="text-gray-700">|</span>
            <span>{t('quiz.questionOf', { current: displayedQ + 1, total: qCount })}</span>
            <CountdownTimer deadline={questionDeadline} label="" />
          </>
        )}
        {phaseIdx === 2 && revealDeadline !== undefined && Number(revealDeadline) > 0 && (
          <>
            <span className="text-gray-700">|</span>
            <CountdownTimer deadline={Number(revealDeadline)} label={t('common.remaining')} />
          </>
        )}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition"
        >
          {showDetails ? t('quiz.hideDetails') : t('common.details')}
        </button>
      </div>

      {showDetails && (
        <div className="mb-6 grid gap-3 rounded-xl border border-gray-800/50 bg-gray-900/50 p-4 sm:grid-cols-3 animate-fade-in-up text-xs">
          <Info label={t('common.contract')} value={`${lobby.slice(0, 6)}...${lobby.slice(-4)}`} mono />
          <Info label={t('quiz.questionDuration')} value={questionDuration !== undefined ? formatDuration(Number(questionDuration)) : '...'} />
          <Info label={t('vote.revealWindow')} value={revealWindow !== undefined ? formatDuration(Number(revealWindow)) : '...'} />
          <Info label={t('common.stake')} value={stake !== undefined ? `${formatEther(stake)} MON` : '...'} />
          <Info label={t('common.owner')} value={owner ? `${(owner as string).slice(0, 6)}...${(owner as string).slice(-4)}` : '...'} mono />
          <div>
            <button onClick={() => setShowMembers(!showMembers)} className="text-gray-500 hover:text-gray-300 transition">
              {showMembers ? t('quiz.hideList') : t('common.members', { count: memCount })}
            </button>
          </div>
        </div>
      )}

      {showDetails && showMembers && memCount > 0 && (
        <div className="mb-4 animate-fade-in-up">
          <MemberList lobbyAddress={lobby} memberCount={memCount} owner={owner as string} />
        </div>
      )}

      <div className="space-y-4">
        {/* PENDING */}
        {phaseIdx === 0 && (
          <WalletGuard fallbackMessage={t('wallet.connectWallet')}>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 animate-fade-in-up">
              {!isMember && !isOwner && (
                <div className="text-center">
                  <div className="mb-4 text-5xl">🎯</div>
                  <h2 className="mb-2 text-lg font-semibold text-white">{t('quiz.joinTitle')}</h2>
                  <p className="mb-4 text-sm text-gray-400">
                    {memCount > 0 ? t('quiz.joinCount', { count: memCount }) : t('quiz.joinFirst')}
                    {stake !== undefined && Number(stake) > 0 && ` · ${t('quiz.joinPrize', { amount: formatEther(stake) })}`}
                  </p>
                  <ActionButton onClick={handleJoin} loading={loading} size="lg" label={t('common.processing')}>{t('common.join')}</ActionButton>
                </div>
              )}
              {isMember && (
                <div className="text-center animate-fade-in">
                  <div className="mb-3 text-4xl">✅</div>
                  <p className="text-green-300 font-medium">{t('quiz.ready')}</p>
                  <p className="text-sm text-gray-500 mt-1">{t('quiz.readyDesc')}</p>
                </div>
              )}
              {isOwner && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <ActionButton onClick={handleStart} loading={loading} size="lg" fullWidth label={t('common.processing')}>
                    {t('quiz.startQuiz', { count: memCount })}
                  </ActionButton>
                </div>
              )}
            </div>
          </WalletGuard>
        )}

        {/* ACTIVE */}
        {phaseIdx === 1 && (
          <div className="space-y-4">
            <QuestionDisplay lobbyAddress={lobby} questionIndex={displayedQ} ipfsCid={effectiveCid}>
              {(options) => {
                if (hasCommitted) {
                  return (
                    <div className="text-center py-4 animate-fade-in">
                      <div className="text-5xl mb-3 animate-check-pop">✅</div>
                      <p className="text-green-300 font-semibold text-lg">{t('quiz.answerSent')}</p>
                      <p className="text-sm text-gray-500 mt-2">{t('quiz.waitNext')}</p>
                    </div>
                  )
                }

                if (!isMember || isOwner) return null

                return (
                  <div className="grid grid-cols-2 gap-3 stagger-children">
                    {options.map((opt, i) => {
                      const s = ANSWER_STYLES[i % ANSWER_STYLES.length]
                      const isSelected = optimisticAnswer === opt
                      return (
                        <button
                          key={i}
                          onClick={() => handleAnswerClick(opt)}
                          disabled={loading || !!optimisticAnswer}
                          className={`${isSelected ? s.selected : s.bg} ${!optimisticAnswer ? s.hover : ''} rounded-xl px-4 py-5 text-white font-bold text-sm flex items-center gap-3 transition-all duration-200 disabled:cursor-not-allowed ${optimisticAnswer && !isSelected ? 'opacity-40' : ''}`}
                        >
                          <span className="text-2xl opacity-80">{s.shape}</span>
                          <span className="leading-tight text-left">{opt}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              }}
            </QuestionDisplay>

            {!isMember && !isOwner && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-900/50 p-5 text-center animate-fade-in">
                <p className="text-sm text-gray-500">{t('quiz.watching')}</p>
              </div>
            )}

            {isOwner && (
              <WalletGuard>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 animate-fade-in-up">
                  <ActionButton onClick={handleRevealNextKey} loading={loading} size="lg" fullWidth label={t('common.processing')}>
                    {curQ < qCount ? `${t('quiz.nextQuestion', { n: curQ + 1 })} ▶` : `${t('quiz.finishQuestions')} ✓`}
                  </ActionButton>
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
                <h2 className="mb-4 text-lg font-semibold text-white">{t('quiz.revealTitle')}</h2>
                {revealProgress ? (
                  <div className="animate-fade-in">
                    <div className="mb-3 h-3 w-full rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-600 transition-all duration-500 ease-out animate-progress-fill"
                        style={{ width: `${(revealProgress.done / revealProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-400">{t('quiz.revealProgress', { done: revealProgress.done, total: revealProgress.total })}</p>
                    {revealProgress.done === revealProgress.total && (
                      <div className="mt-3 flex items-center gap-2 text-green-400 animate-fade-in">
                        <span className="animate-check-pop">✓</span>
                        <span className="text-sm font-medium">{t('quiz.revealDone')}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                    <p className="text-sm text-gray-400">{t('quiz.revealWaiting')}</p>
                  </div>
                )}
              </div>
            )}

            <WalletGuard>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
                <p className="text-sm text-gray-400">{t('quiz.finishHint')}</p>
                <ActionButton onClick={handleFinish} loading={loading} label={t('common.processing')}>{t('quiz.finishQuiz')}</ActionButton>
              </div>
            </WalletGuard>
          </div>
        )}

        {/* FINISHED */}
        {phaseIdx === 3 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center animate-scale-in">
            <div className="text-5xl mb-4">🏆</div>
            <p className="text-lg text-white font-semibold mb-2">{t('quiz.completed')}</p>
            <p className="text-sm text-gray-500">{t('quiz.completedDesc')}</p>
          </div>
        )}

        {phaseIdx === 1 && isMember && showDetails && (
          <WalletGuard>
            <div className="rounded-xl border border-red-800/20 bg-red-900/5 p-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{t('quiz.claimHint')}</p>
                <ActionButton onClick={handleClaimSlash} loading={loading} variant="danger" label={t('common.processing')}>{t('quiz.claim')}</ActionButton>
              </div>
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
      <p className="text-xs text-gray-600 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-300 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function ActionButton({ onClick, loading, children, variant = 'primary', size = 'md', fullWidth = false, label }: {
  onClick: () => void; loading: boolean; children: React.ReactNode; variant?: 'primary' | 'danger'; size?: 'md' | 'lg'; fullWidth?: boolean; label?: string
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
          {label || 'Processing...'}
        </span>
      ) : children}
    </button>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}
