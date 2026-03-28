import { useState, useEffect, useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { fetchFromIpfs, bytes32ToCid, type IpfsQuizPayload } from '../lib/ipfs'
import type { Address } from 'viem'

type Props = {
  lobbyAddress: Address
  questionIndex: number
  ipfsCid?: string
  /** Render prop for interactive answer area */
  children?: (options: string[], questionText: string) => React.ReactNode
}

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'

export default function QuestionDisplay({ lobbyAddress, questionIndex, ipfsCid, children }: Props) {
  const [ipfsData, setIpfsData] = useState<IpfsQuizPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { data: ipfsCidBytes32 } = useReadContract({
    address: lobbyAddress, abi: QuizLobbyABI, functionName: 'ipfsCID',
  })

  const resolvedCid = useMemo(() => {
    if (ipfsCid) return ipfsCid
    if (ipfsCidBytes32 && ipfsCidBytes32 !== ZERO) {
      try { return bytes32ToCid(ipfsCidBytes32) } catch { return '' }
    }
    return ''
  }, [ipfsCid, ipfsCidBytes32])

  useEffect(() => {
    if (!resolvedCid) return
    setLoading(true)
    fetchFromIpfs(resolvedCid)
      .then(setIpfsData)
      .catch((e) => setError(`IPFS yuklenemedi: ${e.message}`))
      .finally(() => setLoading(false))
  }, [resolvedCid])

  if (loading) {
    return (
      <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 p-5 animate-fade-in">
        <div className="h-4 w-20 rounded bg-purple-800/30 animate-shimmer mb-3" />
        <div className="h-6 w-3/4 rounded bg-purple-800/20 animate-shimmer mb-5" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-800/50 animate-shimmer" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/30 bg-red-900/10 p-5 animate-fade-in">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

  const question = ipfsData?.questions.find((q) => q.index === questionIndex)

  if (!question) {
    if (!resolvedCid) return (
      <div className="rounded-xl border border-red-800/30 bg-red-900/10 p-5 animate-fade-in">
        <p className="text-sm text-red-400">Soru verisi bulunamadi.</p>
      </div>
    )
    return (
      <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 p-5 animate-fade-in">
        <div className="h-4 w-20 rounded bg-purple-800/30 animate-shimmer mb-3" />
        <div className="h-6 w-3/4 rounded bg-purple-800/20 animate-shimmer" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 p-5 animate-scale-in">
      <p className="mb-1 text-xs text-purple-400 font-medium">Soru {questionIndex + 1}</p>
      <p className="mb-5 text-lg font-semibold text-white leading-relaxed">{question.question}</p>
      {children ? children(question.options, question.question) : (
        <div className="grid grid-cols-2 gap-3 stagger-children">
          {question.options.map((opt, i) => (
            <div key={i} className="rounded-xl bg-gray-800/60 px-4 py-3 text-sm text-gray-200 border border-gray-700/50">
              <span className="mr-2 font-bold text-purple-400">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
