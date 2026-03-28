import { useState, useEffect, useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { decryptAesGcm, hexToKey } from '../lib/crypto'
import { fetchFromIpfs, bytes32ToCid, type IpfsQuizPayload } from '../lib/ipfs'
import type { Address } from 'viem'

type Props = {
  lobbyAddress: Address
  questionIndex: number
  ipfsCid?: string // URL'den gelen CID (varsa oncelikli)
}

type DecryptedQuestion = {
  question: string
  options: string[]
}

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'

export default function QuestionDisplay({ lobbyAddress, questionIndex, ipfsCid }: Props) {
  const [ipfsData, setIpfsData] = useState<IpfsQuizPayload | null>(null)
  const [decrypted, setDecrypted] = useState<DecryptedQuestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // On-chain'den ipfsCID bytes32 oku
  const { data: ipfsCidBytes32 } = useReadContract({
    address: lobbyAddress, abi: QuizLobbyABI, functionName: 'ipfsCID',
  })

  // CID'yi belirle: prop > on-chain bytes32'den reconstruct
  const resolvedCid = useMemo(() => {
    if (ipfsCid) return ipfsCid
    if (ipfsCidBytes32 && ipfsCidBytes32 !== ZERO) {
      try { return bytes32ToCid(ipfsCidBytes32) } catch { return '' }
    }
    return ''
  }, [ipfsCid, ipfsCidBytes32])

  const { data: revealedKey } = useReadContract({
    address: lobbyAddress, abi: QuizLobbyABI, functionName: 'revealedKeys',
    args: [BigInt(questionIndex)],
  })

  // IPFS fetch
  useEffect(() => {
    if (!resolvedCid) return
    setLoading(true)
    fetchFromIpfs(resolvedCid)
      .then(setIpfsData)
      .catch((e) => setError(`IPFS yuklenemedi: ${e.message}`))
      .finally(() => setLoading(false))
  }, [resolvedCid])

  // Decrypt when key is available
  useEffect(() => {
    if (!revealedKey || revealedKey === ZERO) {
      setDecrypted(null)
      return
    }
    if (!ipfsData) {
      if (!resolvedCid) setError('CID bulunamadi.')
      return
    }

    const encQ = ipfsData.questions.find((q) => q.index === questionIndex)
    if (!encQ) { setError('Soru bulunamadi'); return }

    const key = hexToKey(revealedKey)
    decryptAesGcm(encQ.encryptedPayload, encQ.iv, key)
      .then((text) => {
        const parsed = JSON.parse(text)
        setDecrypted({ question: parsed.question, options: parsed.options })
      })
      .catch((e) => setError(`Sifre cozulemedi: ${e.message}`))
  }, [ipfsData, revealedKey, questionIndex, resolvedCid])

  if (loading) {
    return <div className="text-sm text-gray-500 animate-pulse">Soru yukleniyor...</div>
  }

  if (error) {
    return <div className="text-sm text-red-400">{error}</div>
  }

  if (!revealedKey || revealedKey === ZERO) {
    return (
      <div className="rounded-lg bg-gray-800/50 p-4 text-center">
        <p className="text-sm text-gray-500">Soru {questionIndex}: Anahtar henuz acilmadi.</p>
      </div>
    )
  }

  if (!decrypted) {
    return <div className="text-sm text-gray-500 animate-pulse">Sifre cozuluyor...</div>
  }

  return (
    <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 p-5">
      <p className="mb-1 text-xs text-purple-400">Soru {questionIndex + 1}</p>
      <p className="mb-4 text-lg font-medium text-white">{decrypted.question}</p>
      <div className="grid grid-cols-2 gap-2">
        {decrypted.options.map((opt, i) => (
          <div key={i} className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm text-gray-200">
            <span className="mr-2 font-bold text-purple-400">{String.fromCharCode(65 + i)}.</span>
            {opt}
          </div>
        ))}
      </div>
    </div>
  )
}
