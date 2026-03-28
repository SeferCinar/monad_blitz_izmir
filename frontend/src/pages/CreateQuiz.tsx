import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, keccak256, encodePacked, type Address } from 'viem'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'
import { generateRandomBytes32, generateQuizKeys, encryptAesGcm } from '../lib/crypto'
import { uploadToIpfs, cidToBytes32, type IpfsQuizPayload } from '../lib/ipfs'
import { saveQuizSession } from '../lib/session'

type QuestionInput = {
  question: string
  options: string[]
  correctAnswer: string
}

export default function CreateQuiz() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'questions' | 'config' | 'deploying'>('questions')

  const [questions, setQuestions] = useState<QuestionInput[]>([
    { question: '', options: ['', '', '', ''], correctAnswer: '' },
  ])
  const [questionDuration, setQuestionDuration] = useState('300')
  const [revealWindow, setRevealWindow] = useState('600')
  const [stakeAmount, setStakeAmount] = useState('0.01')
  const [deployStatus, setDeployStatus] = useState('')
  const [error, setError] = useState('')

  // Deploy sirasinda uretilen verileri ref'te tut
  const pendingSession = useRef<{ masterKey: string; correctAnswers: string[]; cid: string } | null>(null)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  // Tx onaylandiktan sonra localStorage'a kaydet ve navigate et
  useEffect(() => {
    if (!receipt?.logs?.[0]?.topics?.[1]) return
    if (!pendingSession.current) return
    const lobbyAddr = ('0x' + receipt.logs[0].topics[1]!.slice(26)) as Address
    const session = pendingSession.current
    pendingSession.current = null
    saveQuizSession(lobbyAddr, session)
    navigate(`/quiz/${lobbyAddr}?cid=${session.cid}`)
  }, [receipt, navigate])

  const addQuestion = () =>
    setQuestions([...questions, { question: '', options: ['', '', '', ''], correctAnswer: '' }])

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return
    setQuestions(questions.filter((_, i) => i !== idx))
  }

  const updateQuestion = (idx: number, field: keyof QuestionInput, value: string) => {
    if (field === 'options') return
    const updated = [...questions]
    updated[idx] = { ...updated[idx], [field]: value }
    setQuestions(updated)
  }

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    const updated = [...questions]
    updated[qIdx].options[optIdx] = value
    setQuestions(updated)
  }

  const validateQuestions = (): string | null => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question.trim()) return `Soru ${i + 1}: Soru metni bos.`
      if (q.options.some((o) => !o.trim())) return `Soru ${i + 1}: Tum secenekleri doldur.`
      if (!q.correctAnswer.trim()) return `Soru ${i + 1}: Dogru cevap secilmedi.`
      if (!q.options.includes(q.correctAnswer)) return `Soru ${i + 1}: Dogru cevap secenekler arasinda degil.`
    }
    return null
  }

  const handleNext = () => {
    const err = validateQuestions()
    if (err) { setError(err); return }
    setError('')
    setStep('config')
  }

  const handleDeploy = async () => {
    setError('')
    setDeployStatus('')

    try {
      setStep('deploying')

      // 1. MasterKey otomatik uret — kullaniciya gosterme
      const masterKey = generateRandomBytes32()
      setDeployStatus('Anahtarlar turetiliyor...')

      // 2. HKDF ile soru anahtarlarini turet
      const keys = await generateQuizKeys(masterKey, questions.length)

      // 3. Key commits
      const keyCommits = keys.map((k) => keccak256(encodePacked(['bytes32'], [k.hex])))

      // 4. Sorulari sifrele (correctAnswer IPFS'e gitmiyor, sadece localStorage'da tutulacak)
      setDeployStatus('Sorular sifreleniyor...')
      const encryptedQuestions = await Promise.all(
        questions.map(async (q, i) => {
          const payload = JSON.stringify({ question: q.question, options: q.options })
          const encrypted = await encryptAesGcm(payload, keys[i].key)
          return { index: i, encryptedPayload: encrypted.ciphertext, iv: encrypted.iv }
        })
      )

      // 5. IPFS'e yukle
      setDeployStatus("IPFS'e yukleniyor...")
      const ipfsPayload: IpfsQuizPayload = {
        quizId: masterKey.slice(0, 18),
        questions: encryptedQuestions,
      }
      const cid = await uploadToIpfs(ipfsPayload)
      const cidBytes32 = cidToBytes32(cid)

      // 6. Session verisini ref'e kaydet (useEffect tx onayini bekleyecek)
      pendingSession.current = {
        masterKey,
        correctAnswers: questions.map((q) => q.correctAnswer),
        cid,
      }

      // 7. Deploy
      setDeployStatus('Kontrat deploy ediliyor...')
      writeContract({
        address: LOBBY_FACTORY_ADDRESS,
        abi: LobbyFactoryABI,
        functionName: 'createQuizLobby',
        args: [
          BigInt(questions.length),
          BigInt(questionDuration),
          BigInt(revealWindow),
          keyCommits,
          cidBytes32,
        ],
        value: parseEther(stakeAmount),
      })
    } catch (e) {
      setError((e as Error).message)
      setStep('config')
    }
  }

  const loading = isPending || isConfirming

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-white">Quiz Olustur</h1>

      {/* Step indicator */}
      <div className="mb-6 flex gap-2">
        {(['questions', 'config', 'deploying'] as const).map((s, i) => (
          <div key={s} className={`flex items-center gap-1.5 text-sm ${step === s ? 'text-purple-400' : 'text-gray-600'}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
              step === s ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-500'
            }`}>{i + 1}</span>
            <span>{s === 'questions' ? 'Sorular' : s === 'config' ? 'Ayarlar' : 'Deploy'}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Step 1: Questions */}
      {step === 'questions' && (
        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Soru {qIdx + 1}</h3>
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(qIdx)} className="text-xs text-red-400 hover:text-red-300">
                    Sil
                  </button>
                )}
              </div>

              <input
                type="text" value={q.question}
                onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                placeholder="Soru metni..."
                className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              />

              <div className="mb-3 grid grid-cols-2 gap-2">
                {q.options.map((opt, optIdx) => (
                  <input
                    key={optIdx} type="text" value={opt}
                    onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                    placeholder={`Secenek ${String.fromCharCode(65 + optIdx)}`}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-500">Dogru Cevap</label>
                <select
                  value={q.correctAnswer}
                  onChange={(e) => updateQuestion(qIdx, 'correctAnswer', e.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Sec...</option>
                  {q.options.filter(Boolean).map((opt, i) => (
                    <option key={i} value={opt}>{String.fromCharCode(65 + i)}: {opt}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          <button
            onClick={addQuestion}
            className="w-full rounded-lg border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-400 hover:border-purple-600 hover:text-purple-400"
          >
            + Soru Ekle
          </button>

          <button
            onClick={handleNext}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-500"
          >
            Devam ({questions.length} soru)
          </button>
        </div>
      )}

      {/* Step 2: Config */}
      {step === 'config' && (
        <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <Field label="Soru Suresi (saniye)" value={questionDuration} onChange={setQuestionDuration} type="number" help="Her soru icin cevaplama suresi" />
          <Field label="Reveal Penceresi (saniye)" value={revealWindow} onChange={setRevealWindow} type="number" help="Quiz bittikten sonra cevap acma suresi" />
          <Field label="Stake (MON)" value={stakeAmount} onChange={setStakeAmount} help="Quiz'i tamamlamazsan katilimcilara dagitilir" />

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep('questions')}
              className="flex-1 rounded-lg bg-gray-800 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700"
            >
              Geri
            </button>
            <button
              onClick={handleDeploy}
              disabled={loading}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {loading ? 'Isleniyor...' : 'Quiz Olustur & Deploy'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Deploying */}
      {step === 'deploying' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
          <div className="mb-4 animate-pulse text-lg text-purple-400">{deployStatus || 'Isleniyor...'}</div>
          <p className="text-sm text-gray-500">Lutfen bekleyin, islem tamamlaninca otomatik yonlendirileceksiniz.</p>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', help }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; help?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
      />
      {help && <p className="mt-1 text-xs text-gray-600">{help}</p>}
    </div>
  )
}
