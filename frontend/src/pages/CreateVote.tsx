import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, type Address } from 'viem'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'

export default function CreateVote() {
  const navigate = useNavigate()
  const [optionCount, setOptionCount] = useState('3')
  const [voteDuration, setVoteDuration] = useState('300')
  const [revealWindow, setRevealWindow] = useState('600')
  const [stakeAmount, setStakeAmount] = useState('0.01')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  if (receipt?.logs?.[0]?.topics?.[1]) {
    const lobbyAddr = ('0x' + receipt.logs[0].topics[1]!.slice(26)) as Address
    navigate(`/vote/${lobbyAddr}`)
  }

  const handleCreate = () => {
    writeContract({
      address: LOBBY_FACTORY_ADDRESS,
      abi: LobbyFactoryABI,
      functionName: 'createVoteLobby',
      args: [BigInt(optionCount), BigInt(voteDuration), BigInt(revealWindow)],
      value: parseEther(stakeAmount),
    })
  }

  const loading = isPending || isConfirming

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-white">Oylama Olustur</h1>

      <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
        <Field label="Secenek Sayisi" value={optionCount} onChange={setOptionCount} type="number" />
        <Field label="Oylama Suresi (saniye)" value={voteDuration} onChange={setVoteDuration} type="number" />
        <Field label="Reveal Penceresi (saniye)" value={revealWindow} onChange={setRevealWindow} type="number" />
        <Field label="Stake (MON)" value={stakeAmount} onChange={setStakeAmount} />

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Isleniyor...' : 'Oylama Olustur'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
      />
    </div>
  )
}
