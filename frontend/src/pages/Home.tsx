import { useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'
import LobbyCard from '../components/LobbyCard'
import LobbySearch from '../components/LobbySearch'
import type { Address } from 'viem'

type PhaseFilter = 'all' | '0' | '1' | '2' | '3'

const FILTER_LABELS: Record<PhaseFilter, string> = {
  all: 'Tumu',
  '0': 'Beklemede',
  '1': 'Aktif',
  '2': 'Reveal',
  '3': 'Bitti',
}

export default function Home() {
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all')

  const { data: quizCount } = useReadContract({
    address: LOBBY_FACTORY_ADDRESS,
    abi: LobbyFactoryABI,
    functionName: 'quizLobbyCount',
  })

  const { data: voteCount } = useReadContract({
    address: LOBBY_FACTORY_ADDRESS,
    abi: LobbyFactoryABI,
    functionName: 'voteLobbyCount',
  })

  const quizIndexes = quizCount ? Array.from({ length: Number(quizCount) }, (_, i) => i) : []
  const voteIndexes = voteCount ? Array.from({ length: Number(voteCount) }, (_, i) => i) : []

  const { data: quizAddresses } = useReadContracts({
    contracts: quizIndexes.map((i) => ({
      address: LOBBY_FACTORY_ADDRESS,
      abi: LobbyFactoryABI,
      functionName: 'quizLobbies' as const,
      args: [BigInt(i)] as const,
    })),
  })

  const { data: voteAddresses } = useReadContracts({
    contracts: voteIndexes.map((i) => ({
      address: LOBBY_FACTORY_ADDRESS,
      abi: LobbyFactoryABI,
      functionName: 'voteLobbies' as const,
      args: [BigInt(i)] as const,
    })),
  })

  const quizList = quizAddresses?.filter((r) => r.status === 'success').map((r) => r.result as Address) ?? []
  const voteList = voteAddresses?.filter((r) => r.status === 'success').map((r) => r.result as Address) ?? []

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-4xl font-bold text-white">Monad Blitz</h1>
        <p className="text-gray-400">Merkeziyetsiz Quiz & Oylama Platformu</p>
      </div>

      <LobbySearch />

      {/* Phase filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as PhaseFilter[]).map((key) => (
          <button
            key={key}
            onClick={() => setPhaseFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              phaseFilter === key
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-white">
          Quiz Lobileri
          <span className="ml-2 text-sm font-normal text-gray-500">({quizList.length})</span>
        </h2>
        {quizList.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {quizList.map((addr) => (
              <LobbyCard key={addr} address={addr} type="quiz" phaseFilter={phaseFilter} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Henuz quiz lobisi yok.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">
          Oylama Lobileri
          <span className="ml-2 text-sm font-normal text-gray-500">({voteList.length})</span>
        </h2>
        {voteList.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {voteList.map((addr) => (
              <LobbyCard key={addr} address={addr} type="vote" phaseFilter={phaseFilter} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Henuz oylama lobisi yok.</p>
        )}
      </section>
    </div>
  )
}
