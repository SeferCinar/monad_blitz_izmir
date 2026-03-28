import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAddress } from 'viem'
import { useReadContract } from 'wagmi'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'
import type { Address } from 'viem'
import { loadCid } from '../lib/session'
import { useT } from '../i18n/LanguageContext'

export default function LobbySearch() {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { t } = useT()

  const trimmed = input.trim()
  const isValidAddr = isAddress(trimmed)

  const { data: isQuiz } = useReadContract({
    address: LOBBY_FACTORY_ADDRESS,
    abi: LobbyFactoryABI,
    functionName: 'isQuizLobby',
    args: isValidAddr ? [trimmed as Address] : undefined,
    query: { enabled: isValidAddr },
  })

  const { data: isVote } = useReadContract({
    address: LOBBY_FACTORY_ADDRESS,
    abi: LobbyFactoryABI,
    functionName: 'isVoteLobby',
    args: isValidAddr ? [trimmed as Address] : undefined,
    query: { enabled: isValidAddr },
  })

  const handleSearch = () => {
    setError('')

    if (!trimmed) return
    if (!isValidAddr) {
      setError(t('search.invalidAddress'))
      return
    }

    if (isQuiz) {
      const cid = loadCid(trimmed)
      navigate(cid ? `/quiz/${trimmed}?cid=${cid}` : `/quiz/${trimmed}`)
    } else if (isVote) {
      navigate(`/vote/${trimmed}`)
    } else {
      setError(t('search.notFound'))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="mb-8">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:border-purple-500 focus:outline-none"
        />
        <button
          onClick={handleSearch}
          className="rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-500"
        >
          {t('search.button')}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}
