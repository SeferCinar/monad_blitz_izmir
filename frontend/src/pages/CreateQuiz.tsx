import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, keccak256, encodePacked, type Address } from 'viem'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'
import { generateRandomBytes32, generateQuizKeys } from '../lib/crypto'
import { uploadToIpfs, cidToBytes32, type IpfsQuizPayload } from '../lib/ipfs'
import { saveQuizSession, saveLobbyName } from '../lib/session'
import { useT } from '../i18n/LanguageContext'

type QuestionInput = {
  question: string
  options: string[]
  correctAnswer: string
}

export default function CreateQuiz() {
  const navigate = useNavigate()
  const { t } = useT()
  const [step, setStep] = useState<'questions' | 'config' | 'deploying'>('questions')

  const [lobbyName, setLobbyName] = useState('')
  const [questions, setQuestions] = useState<QuestionInput[]>([
    { question: '', options: ['', '', '', ''], correctAnswer: '' },
  ])
  const [questionDuration, setQuestionDuration] = useState('300')
  const [revealWindow, setRevealWindow] = useState('600')
  const [stakeAmount, setStakeAmount] = useState('0.01')
  const [deployStatus, setDeployStatus] = useState('')
  const [error, setError] = useState('')

  const pendingSession = useRef<{ masterKey: string; correctAnswers: string[]; cid: string } | null>(null)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (!receipt?.logs?.[0]?.topics?.[1]) return
    if (!pendingSession.current) return
    const lobbyAddr = ('0x' + receipt.logs[0].topics[1]!.slice(26)) as Address
    const session = pendingSession.current
    pendingSession.current = null
    saveQuizSession(lobbyAddr, session)
    if (lobbyName.trim()) saveLobbyName(lobbyAddr, lobbyName.trim())
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
    if (!lobbyName.trim()) return t('createQuiz.nameRequired')
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question.trim()) return t('createQuiz.questionEmpty', { n: i + 1 })
      if (q.options.some((o) => !o.trim())) return t('createQuiz.optionsEmpty', { n: i + 1 })
      if (!q.correctAnswer.trim()) return t('createQuiz.noCorrectAnswer', { n: i + 1 })
      if (!q.options.includes(q.correctAnswer)) return t('createQuiz.correctNotInOptions', { n: i + 1 })
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

      const masterKey = generateRandomBytes32()
      setDeployStatus(t('createQuiz.generatingKeys'))

      const keys = await generateQuizKeys(masterKey, questions.length)
      const keyCommits = keys.map((k) => keccak256(encodePacked(['bytes32'], [k.hex])))

      setDeployStatus(t('createQuiz.uploadingIpfs'))
      const ipfsPayload: IpfsQuizPayload = {
        quizId: masterKey.slice(0, 18),
        name: lobbyName.trim(),
        questions: questions.map((q, i) => ({
          index: i,
          question: q.question,
          options: q.options,
        })),
      }
      const cid = await uploadToIpfs(ipfsPayload)
      const cidBytes32 = cidToBytes32(cid)

      pendingSession.current = {
        masterKey,
        correctAnswers: questions.map((q) => q.correctAnswer),
        cid,
      }

      setDeployStatus(t('createQuiz.deploying'))
      writeContract({
        address: LOBBY_FACTORY_ADDRESS,
        abi: LobbyFactoryABI,
        functionName: 'createQuizLobby',
        args: [
          lobbyName.trim(),
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
      <h1 className="mb-6 text-2xl font-bold text-white">{t('createQuiz.title')}</h1>

      {/* Step indicator */}
      <div className="mb-6 flex gap-2">
        {(['questions', 'config', 'deploying'] as const).map((s, i) => (
          <div key={s} className={`flex items-center gap-1.5 text-sm ${step === s ? 'text-purple-400' : 'text-gray-600'}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
              step === s ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-500'
            }`}>{i + 1}</span>
            <span>{s === 'questions' ? t('createQuiz.stepQuestions') : s === 'config' ? t('createQuiz.stepConfig') : t('createQuiz.stepDeploy')}</span>
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
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <label className="mb-1 block text-sm text-gray-400">{t('createQuiz.quizName')}</label>
            <input
              type="text" value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              placeholder={t('createQuiz.quizNamePlaceholder')}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
            />
          </div>

          {questions.map((q, qIdx) => (
            <div key={qIdx} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{t('quiz.question', { n: qIdx + 1 })}</h3>
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(qIdx)} className="text-xs text-red-400 hover:text-red-300">
                    {t('createQuiz.delete')}
                  </button>
                )}
              </div>

              <input
                type="text" value={q.question}
                onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                placeholder={t('createQuiz.questionPlaceholder')}
                className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              />

              <div className="mb-3 grid grid-cols-2 gap-2">
                {q.options.map((opt, optIdx) => (
                  <input
                    key={optIdx} type="text" value={opt}
                    onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                    placeholder={`${t('common.option', { n: '' })}${String.fromCharCode(65 + optIdx)}`}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-500">{t('createQuiz.correctAnswer')}</label>
                <select
                  value={q.correctAnswer}
                  onChange={(e) => updateQuestion(qIdx, 'correctAnswer', e.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">{t('createQuiz.selectAnswer')}</option>
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
            + {t('createQuiz.addQuestion')}
          </button>

          <button
            onClick={handleNext}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-500"
          >
            {t('createQuiz.continue')} ({t('quiz.questions', { count: questions.length })})
          </button>
        </div>
      )}

      {/* Step 2: Config */}
      {step === 'config' && (
        <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <Field label={t('createQuiz.questionDuration')} value={questionDuration} onChange={setQuestionDuration} type="number" help={t('createQuiz.questionDurationHelp')} />
          <Field label={t('createVote.revealWindow')} value={revealWindow} onChange={setRevealWindow} type="number" help={t('createQuiz.revealWindowHelp')} />
          <Field label={t('createVote.stake')} value={stakeAmount} onChange={setStakeAmount} help={t('createQuiz.stakeHelp')} />

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep('questions')}
              className="flex-1 rounded-lg bg-gray-800 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700"
            >
              {t('createQuiz.back')}
            </button>
            <button
              onClick={handleDeploy}
              disabled={loading}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {loading ? t('common.processing') : t('createQuiz.deploy')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Deploying */}
      {step === 'deploying' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
          <div className="mb-4 animate-pulse text-lg text-purple-400">{deployStatus || t('common.processing')}</div>
          <p className="text-sm text-gray-500">{t('createQuiz.deployingWait')}</p>
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
