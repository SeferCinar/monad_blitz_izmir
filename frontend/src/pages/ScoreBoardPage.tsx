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

export default function ScoreBoardPage() {
  const { address: boardAddr } = useParams<{ address: string }>()
  const board = boardAddr as Address
  const { address: userAddr } = useAuth()

  const { data: quizLobbyAddr } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'quizLobby' })
  const { data: owner } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'owner' })
  const { data: answersSubmitted } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'answersSubmitted' })
  const { data: scored } = useReadContract({ address: board, abi: ScoreBoardABI, functionName: 'scored' })

  // Quiz lobby details
  const quizLobby = quizLobbyAddr as Address | undefined
  const { data: questionCount } = useReadContract({
    address: quizLobby, abi: QuizLobbyABI, functionName: 'questionCount',
    query: { enabled: !!quizLobby },
  })
  const { data: memberCount } = useReadContract({
    address: quizLobby, abi: QuizLobbyABI, functionName: 'memberCount',
    query: { enabled: !!quizLobby },
  })

  // Fetch members
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

  // Fetch scores (if scored)
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

  // Dogru cevaplar: once localStorage'dan yukle (owner quiz'i olusturmussa), yoksa manuel girilebilir
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
      alert(`${qCount} cevap gerekli, ${answers.length} girildi.`)
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

  // Leaderboard
  const leaderboard = members
    .map((addr, i) => ({
      address: addr,
      score: scoresData?.[i]?.status === 'success' ? Number(scoresData[i].result) : 0,
    }))
    .sort((a, b) => b.score - a.score)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Skor Tablosu</h1>

      <div className="mb-6 grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 sm:grid-cols-3">
        <Info label="ScoreBoard Adresi" value={board} mono />
        <Info label="Quiz Lobisi" value={quizLobby ?? '...'} mono />
        <Info label="Owner" value={owner ? `${(owner as string).slice(0, 8)}...${(owner as string).slice(-6)}` : '...'} mono />
        <Info label="Soru Sayisi" value={qCount.toString()} />
        <Info label="Katilimci" value={memCount.toString()} />
        <Info label="Durum" value={scored ? 'Skorlar Hesaplandi' : answersSubmitted ? 'Cevaplar Girildi' : 'Cevap Bekleniyor'} />
      </div>

      <div className="space-y-4">
        {/* Step 1: Submit correct answers (owner only) */}
        {!answersSubmitted && isOwner && (
          <WalletGuard>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Dogru Cevaplari Gir</h2>
              <p className="mb-2 text-sm text-gray-400">
                Her satira bir cevap yaz (soru sirasi ile ayni sirada). Toplam {qCount} cevap gerekli.
              </p>
              <textarea
                value={correctAnswers}
                onChange={(e) => setCorrectAnswers(e.target.value)}
                rows={Math.max(4, qCount)}
                placeholder={"A\nB\nC\nA"}
                className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              />
              <button
                onClick={handleSubmitAnswers}
                disabled={loading}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {loading ? 'Isleniyor...' : 'Cevaplari Gonder'}
              </button>
            </div>
          </WalletGuard>
        )}

        {/* Step 2: Calculate scores */}
        {answersSubmitted && !scored && (
          <WalletGuard>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Skorlari Hesapla</h2>
                <p className="text-sm text-gray-400">Dogru cevaplar girildi. Skorlama calistir.</p>
              </div>
              <button
                onClick={handleCalculateScores}
                disabled={loading}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {loading ? 'Isleniyor...' : 'Hesapla'}
              </button>
            </div>
          </WalletGuard>
        )}

        {/* Step 3: Leaderboard */}
        {scored && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Siralama</h2>
            <div className="space-y-2">
              {leaderboard.map((entry, rank) => (
                <div
                  key={entry.address}
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 ${
                    rank === 0 ? 'bg-yellow-900/20 border border-yellow-800/30' :
                    rank === 1 ? 'bg-gray-800/80' :
                    rank === 2 ? 'bg-orange-900/10 border border-orange-800/20' :
                    'bg-gray-800/40'
                  }`}
                >
                  <span className={`w-8 text-lg font-bold ${
                    rank === 0 ? 'text-yellow-400' : rank === 1 ? 'text-gray-400' : rank === 2 ? 'text-orange-400' : 'text-gray-600'
                  }`}>
                    #{rank + 1}
                  </span>
                  <span className="flex-1 font-mono text-sm text-gray-300">
                    {entry.address.slice(0, 8)}...{entry.address.slice(-6)}
                    {entry.address.toLowerCase() === userAddr?.toLowerCase() && (
                      <span className="ml-2 text-purple-400">(sen)</span>
                    )}
                  </span>
                  <span className="text-lg font-bold text-white">
                    {entry.score}/{qCount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!answersSubmitted && !isOwner && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-gray-500">Owner henuz dogru cevaplari girmedi.</p>
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
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm text-gray-200 ${mono ? 'font-mono break-all' : ''}`}>{value}</p>
    </div>
  )
}
