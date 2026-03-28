import { useState, useEffect, useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { fetchFromIpfs, bytes32ToCid, type IpfsQuizPayload } from '../lib/ipfs'
import type { Address } from 'viem'

type Props = {
  lobbyAddress: Address
  questionIndex: number
  ipfsCid?: string
}

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'

export default function QuestionDisplay({ lobbyAddress, questionIndex, ipfsCid }: Props) {
  const [ipfsData, setIpfsData] = useState<IpfsQuizPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // On-chain'den ipfsCID bytes32 oku (fallback)
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

  // IPFS fetch
  useEffect(() => {
    if (!resolvedCid) return
    setLoading(true)
    fetchFromIpfs(resolvedCid)
      .then(setIpfsData)
      .catch((e) => setError(`IPFS yuklenemedi: ${e.message}`))
      .finally(() => setLoading(false))
  }, [resolvedCid])

  if (loading) {
    return <div className="text-sm text-gray-500 animate-pulse">Soru yukleniyor...</div>
  }

  if (error) {
    return <div className="text-sm text-red-400">{error}</div>
  }

  const question = ipfsData?.questions.find((q) => q.index === questionIndex)

  if (!question) {
    if (!resolvedCid) return <div className="text-sm text-red-400">CID bulunamadi.</div>
    return <div className="text-sm text-gray-500 animate-pulse">Soru yukleniyor...</div>
  }

  return (
    <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 p-5">
      <p className="mb-1 text-xs text-purple-400">Soru {questionIndex + 1}</p>
      <p className="mb-4 text-lg font-medium text-white">{question.question}</p>
      <div className="grid grid-cols-2 gap-2">
        {question.options.map((opt, i) => (
          <div key={i} className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm text-gray-200">
            <span className="mr-2 font-bold text-purple-400">{String.fromCharCode(65 + i)}.</span>
            {opt}
          </div>
        ))}
      </div>
    </div>
  )
}
