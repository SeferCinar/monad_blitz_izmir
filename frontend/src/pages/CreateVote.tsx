import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, type Address } from 'viem'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'
import { saveLobbyName } from '../lib/session'

export default function CreateVote() {
  const navigate = useNavigate()
  const [lobbyName, setLobbyName] = useState('')
  const [optionCount, setOptionCount] = useState('3')
  const [voteDuration, setVoteDuration] = useState('300')
  const [revealWindow, setRevealWindow] = useState('600')
  const [stakeAmount, setStakeAmount] = useState('0.01')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  if (receipt?.logs?.[0]?.topics?.[1]) {
    const lobbyAddr = ('0x' + receipt.logs[0].topics[1]!.slice(26)) as Address
    if (lobbyName.trim()) saveLobbyName(lobbyAddr, lobbyName.trim())
    navigate(`/vote/${lobbyAddr}`)
  }

  const handleCreate = () => {
    if (!lobbyName.trim()) return
    writeContract({
      address: LOBBY_FACTORY_ADDRESS,
      abi: LobbyFactoryABI,
      functionName: 'createVoteLobby',
      args: [lobbyName.trim(), BigInt(optionCount), BigInt(voteDuration), BigInt(revealWindow)],
      value: parseEther(stakeAmount),
    })
  }

  const loading = isPending || isConfirming

  return (
    <div className="mx-auto max-w-lg animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold text-white">Oylama Olustur</h1>

      <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
        <Field label="Oylama Ismi" value={lobbyName} onChange={setLobbyName} placeholder="ornek: En iyi programlama dili" />
        <Field label="Secenek Sayisi" value={optionCount} onChange={setOptionCount} type="number" />
        <Field label="Oylama Suresi (saniye)" value={voteDuration} onChange={setVoteDuration} type="number" />
        <Field label="Reveal Penceresi (saniye)" value={revealWindow} onChange={setRevealWindow} type="number" />
        <Field label="Stake (MON)" value={stakeAmount} onChange={setStakeAmount} />

        <button
          onClick={handleCreate}
          disabled={loading || !lobbyName.trim()}
          className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Isleniyor...
            </span>
          ) : 'Oylama Olustur'}
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
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
      />
    </div>
  )
}
