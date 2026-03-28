import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { decryptAesGcm, deriveQuestionKey, hexToKey } from '../lib/crypto'
import { fetchFromIpfs, type IpfsQuizPayload, type EncryptedQuestion } from '../lib/ipfs'
import type { Address } from 'viem'

type Props = {
  lobbyAddress: Address
  questionIndex: number
  ipfsCid?: string
  masterKeyHex?: string
}

type DecryptedQuestion = {
  question: string
  options: string[]
}

export default function QuestionDisplay({ lobbyAddress, questionIndex, ipfsCid, masterKeyHex }: Props) {
  const [ipfsData, setIpfsData] = useState<IpfsQuizPayload | null>(null)
  const [decrypted, setDecrypted] = useState<DecryptedQuestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { data: revealedKey } = useReadContract({
    address: lobbyAddress, abi: QuizLobbyABI, functionName: 'revealedKeys',
    args: [BigInt(questionIndex)],
  })

  // IPFS fetch
  useEffect(() => {
    if (!ipfsCid) return
    setLoading(true)
    fetchFromIpfs(ipfsCid)
      .then(setIpfsData)
      .catch((e) => setError(`IPFS yuklenemedi: ${e.message}`))
      .finally(() => setLoading(false))
  }, [ipfsCid])

  // Decrypt when key is available
  useEffect(() => {
    if (!ipfsData || !revealedKey || revealedKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      setDecrypted(null)
      return
    }

    const encQ = ipfsData.questions.find((q) => q.index === questionIndex)
    if (!encQ) { setError('Soru bulunamadi'); return }

    decryptQuestion(encQ, revealedKey, questionIndex, masterKeyHex)
      .then(setDecrypted)
      .catch((e) => setError(`Sifre cozulemedi: ${e.message}`))
  }, [ipfsData, revealedKey, questionIndex, masterKeyHex])

  if (loading) {
    return <div className="text-sm text-gray-500 animate-pulse">Soru yukleniyor...</div>
  }

  if (error) {
    return <div className="text-sm text-red-400">{error}</div>
  }

  if (!revealedKey || revealedKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
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

async function decryptQuestion(
  encQ: EncryptedQuestion,
  revealedKey: string,
  questionIndex: number,
  masterKeyHex?: string
): Promise<DecryptedQuestion> {
  // revealedKey is the key itself (from contract), try direct decryption
  const key = hexToKey(revealedKey)

  try {
    const text = await decryptAesGcm(encQ.encryptedPayload, encQ.iv, key)
    const parsed = JSON.parse(text)
    return { question: parsed.question, options: parsed.options }
  } catch {
    // revealedKey might be the raw key, try HKDF derivation if masterKey is provided
    if (masterKeyHex) {
      const masterKey = hexToKey(masterKeyHex)
      const derivedKey = await deriveQuestionKey(masterKey, questionIndex)
      const text = await decryptAesGcm(encQ.encryptedPayload, encQ.iv, derivedKey)
      const parsed = JSON.parse(text)
      return { question: parsed.question, options: parsed.options }
    }
    throw new Error('Anahtar ile sifre cozulemedi')
  }
}
