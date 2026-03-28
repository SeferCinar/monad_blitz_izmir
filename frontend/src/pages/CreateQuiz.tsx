import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, type Address } from 'viem'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'

export default function CreateQuiz() {
  const navigate = useNavigate()
  const [questionCount, setQuestionCount] = useState('3')
  const [questionDuration, setQuestionDuration] = useState('300')
  const [revealWindow, setRevealWindow] = useState('600')
  const [keyCommits, setKeyCommits] = useState('')
  const [ipfsCID, setIpfsCID] = useState('')
  const [stakeAmount, setStakeAmount] = useState('0.01')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  // Extract deployed lobby address from logs
  if (receipt?.logs?.[0]?.topics?.[1]) {
    const lobbyAddr = ('0x' + receipt.logs[0].topics[1]!.slice(26)) as Address
    navigate(`/quiz/${lobbyAddr}`)
  }

  const handleCreate = () => {
    const commits = keyCommits
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean) as `0x${string}`[]

    writeContract({
      address: LOBBY_FACTORY_ADDRESS,
      abi: LobbyFactoryABI,
      functionName: 'createQuizLobby',
      args: [
        BigInt(questionCount),
        BigInt(questionDuration),
        BigInt(revealWindow),
        commits,
        ipfsCID as `0x${string}`,
      ],
      value: parseEther(stakeAmount),
    })
  }

  const loading = isPending || isConfirming

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-white">Quiz Olustur</h1>

      <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
        <Field label="Soru Sayisi" value={questionCount} onChange={setQuestionCount} type="number" />
        <Field label="Soru Suresi (saniye)" value={questionDuration} onChange={setQuestionDuration} type="number" />
        <Field label="Reveal Penceresi (saniye)" value={revealWindow} onChange={setRevealWindow} type="number" />
        <Field label="Stake (MON)" value={stakeAmount} onChange={setStakeAmount} />
        <Field label="IPFS CID (bytes32)" value={ipfsCID} onChange={setIpfsCID} placeholder="0x..." />

        <div>
          <label className="mb-1 block text-sm text-gray-400">Key Commits (her satira bir bytes32)</label>
          <textarea
            value={keyCommits}
            onChange={(e) => setKeyCommits(e.target.value)}
            rows={4}
            placeholder={"0xabc...\n0xdef..."}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Isleniyor...' : 'Quiz Olustur'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
      />
    </div>
  )
}
