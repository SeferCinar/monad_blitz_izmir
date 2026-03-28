import { useParams } from 'react-router-dom'
import { useReadContract, useReadContracts } from 'wagmi'
import { ScoreBoardABI } from '../abi/ScoreBoard'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { useAuth } from '../hooks/useAuth'
import { useTxFeedback } from '../hooks/useTxFeedback'
import WalletGuard from '../components/WalletGuard'
import TxToast from '../components/TxToast'
import type { Address } from 'viem'
import { useState, useEffect } from 'react'
import { keccak256, encodePacked } from 'viem'
import { loadQuizSession } from '../lib/session'
import { useT } from '../i18n/LanguageContext'

const RANK_STYLES = [
  'bg-yellow-900/20 border border-yellow-700/30',
  'bg-gray-800/60 border border-gray-700/30',
  'bg-orange-900/15 border border-orange-800/20',
]
const RANK_COLORS = ['text-yellow-400', 'text-gray-400', 'text-orange-400']
const RANK_EMOJI = ['🥇', '🥈', '🥉']

export default function ScoreBoardPage() {
  const { address: boardAddr } = useParams<{ address: string }>()
  const board = boardAddr as Address
  const { address: userAddr } = useAuth()
  const { t } = useT()

  const { data: quizLobbyAddr } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'quizLobby' })
  const { data: owner } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'owner' })
  const { data: answersSubmitted } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'answersSubmitted' })
  const { data: scored } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'scored' })

  const quizLobby = quizLobbyAddr as Address | undefined
  const { data: questionCount } = useReadContract({
    address: quizLobby, abi: QuizLobbyABI, functionName: 'questionCount',
    query: { enabled: !!quizLobby },
  })
  const { data: memberCount } = useReadContract({
    address: quizLobby, abi: QuizLobbyABI, functionName: 'memberCount',
    query: { enabled: !!quizLobby },
  })

  const memCount = memberCount !== undefined ? Number(memberCount) : 0
  const { data: membersData } = useReadContracts({
    contracts: Array.from({ length: memCount }, (_, i) => ({
      address: quizLobby!,
      abi: QuizLobbyABI,
      functionName: 'members' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: !!quizLobby && memCount > 0 },
  })

  const members = membersData?.filter((r) => r.status === 'success').map((r) => r.result as Address) ?? []

  const { data: scoresData } = useReadContracts({
    contracts: members.map((addr) => ({
      address: board,
      abi: ScoreBoardABI,
      functionName: 'getScore' as const,
      args: [addr] as const,
    })),
    query: { enabled: scored === true && members.length > 0 },
  })

  const { writeContract, loading, toast, dismissToast } = useTxFeedback()

  const [correctAnswers, setCorrectAnswers] = useState('')

  useEffect(() => {
    if (!quizLobby) return
    const session = loadQuizSession(quizLobby)
    if (session?.correctAnswers?.length) {
      setCorrectAnswers(session.correctAnswers.join('\n'))
    }
  }, [quizLobby])

  const isOwner = userAddr && owner && userAddr.toLowerCase() === (owner as string).toLowerCase()
  const qCount = questionCount !== undefined ? Number(questionCount) : 0

  const handleSubmitAnswers = () => {
    const answers = correctAnswers.split('\n').map((a) => a.trim()).filter(Boolean)
    if (answers.length !== qCount) {
      alert(t('score.answerMismatch', { expected: qCount, got: answers.length }))
      return
    }
    const hashes = answers.map((a) => keccak256(encodePacked(['string'], [a])))
    writeContract({
      address: board, abi: ScoreBoardABI, functionName: 'submitCorrectAnswers',
      args: [hashes],
    })
  }

  const handleCalculateScores = () => {
    writeContract({ address: board, abi: ScoreBoardABI, functionName: 'calculateScores' })
  }

  const leaderboard = members
    .map((addr, i) => ({
      address: addr,
      score: scoresData?.[i]?.status === 'success' ? Number(scoresData[i].result) : 0,
    }))
    .sort((a, b) => b.score - a.score)

  const statusLabel = scored ? t('score.ready') : answersSubmitted ? t('score.waiting') : t('score.awaitingAnswers')
  const statusColor = scored ? 'text-green-400 bg-green-900/20' : answersSubmitted ? 'text-blue-400 bg-blue-900/20' : 'text-yellow-400 bg-yellow-900/20'

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">{t('score.title')}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mb-6 flex items-center gap-4 text-sm text-gray-400">
        <span>{t('quiz.questions', { count: qCount })}</span>
        <span className="text-gray-700">|</span>
        <span>{t('lobby.participants', { count: memCount })}</span>
      </div>

      <div className="space-y-4">
        {!answersSubmitted && isOwner && (
          <WalletGuard>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 animate-fade-in-up">
              <h2 className="mb-3 text-lg font-semibold text-white">{t('score.enterAnswers')}</h2>
              <p className="mb-3 text-sm text-gray-400">
                {t('score.enterAnswersDesc', { count: qCount })}
              </p>
              <textarea
                value={correctAnswers}
                onChange={(e) => setCorrectAnswers(e.target.value)}
                rows={Math.max(4, qCount)}
                placeholder={"A\nB\nC\nA"}
                className="mb-3 w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200 font-mono placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
              />
              <button
                onClick={handleSubmitAnswers}
                disabled={loading}
                className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 transition-all duration-200"
              >
                {loading ? t('common.processing') : t('score.submitAnswers')}
              </button>
            </div>
          </WalletGuard>
        )}

        {answersSubmitted && !scored && (
          <WalletGuard>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 flex items-center justify-between animate-fade-in-up">
              <div>
                <h2 className="text-lg font-semibold text-white">{t('score.calculateTitle')}</h2>
                <p className="text-sm text-gray-400">{t('score.calculateDesc')}</p>
              </div>
              <button
                onClick={handleCalculateScores}
                disabled={loading}
                className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 transition-all duration-200"
              >
                {loading ? t('common.processing') : t('score.calculate')}
              </button>
            </div>
          </WalletGuard>
        )}

        {scored && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 animate-scale-in">
            <h2 className="mb-5 text-lg font-semibold text-white">{t('score.leaderboard')}</h2>
            <div className="space-y-2 stagger-children">
              {leaderboard.map((entry, rank) => {
                const isMe = entry.address.toLowerCase() === userAddr?.toLowerCase()
                return (
                  <div
                    key={entry.address}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                      rank < 3 ? RANK_STYLES[rank] : 'bg-gray-800/30'
                    } ${isMe ? 'ring-1 ring-purple-500/50' : ''}`}
                  >
                    <span className={`w-8 text-lg font-bold ${rank < 3 ? RANK_COLORS[rank] : 'text-gray-600'}`}>
                      {rank < 3 ? RANK_EMOJI[rank] : `#${rank + 1}`}
                    </span>
                    <span className="flex-1 font-mono text-sm text-gray-300">
                      {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                      {isMe && <span className="ml-2 text-purple-400 font-sans">{t('score.you')}</span>}
                    </span>
                    <span className="text-lg font-bold text-white">
                      {entry.score}<span className="text-gray-500 text-sm font-normal">/{qCount}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!answersSubmitted && !isOwner && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center animate-fade-in">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-gray-400">{t('score.notReady')}</p>
          </div>
        )}
      </div>

      <TxToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
