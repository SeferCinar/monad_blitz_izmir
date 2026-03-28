import { useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { LobbyFactoryABI } from '../abi/LobbyFactory'
import { LOBBY_FACTORY_ADDRESS } from '../config/contracts'
import LobbyCard from '../components/LobbyCard'
import type { Address } from 'viem'
import { useT } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'

type PhaseFilter = 'all' | '0' | '1' | '2' | '3'

const FILTER_KEYS: Record<PhaseFilter, TranslationKey> = {
  all: 'filter.all',
  '0': 'filter.pending',
  '1': 'filter.active',
  '2': 'filter.reveal',
  '3': 'filter.finished',
}

export default function Home() {
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all')
  const { t } = useT()

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

  const totalLobbies = quizList.length + voteList.length

  return (
    <div className="animate-fade-in">
      <div className="mb-10 text-center">
        <h1 className="mb-2 text-4xl font-bold text-white">{t('home.title')}</h1>
        <p className="text-gray-400">{t('home.subtitle')}</p>
        {totalLobbies > 0 && (
          <p className="mt-2 text-sm text-gray-600">{t('home.activeLobbies', { count: totalLobbies })}</p>
        )}
      </div>

      {/* Phase filter */}
      <div className="mb-6 flex flex-wrap gap-2 justify-center">
        {(Object.keys(FILTER_KEYS) as PhaseFilter[]).map((key) => (
          <button
            key={key}
            onClick={() => setPhaseFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              phaseFilter === key
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {t(FILTER_KEYS[key])}
          </button>
        ))}
      </div>

      {quizList.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-white flex items-center gap-2">
            🎯 {t('home.quizzes')}
            <span className="text-sm font-normal text-gray-500">({quizList.length})</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 stagger-children">
            {quizList.map((addr) => (
              <LobbyCard key={addr} address={addr} type="quiz" phaseFilter={phaseFilter} />
            ))}
          </div>
        </section>
      )}

      {voteList.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-white flex items-center gap-2">
            🗳️ {t('home.votes')}
            <span className="text-sm font-normal text-gray-500">({voteList.length})</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 stagger-children">
            {voteList.map((addr) => (
              <LobbyCard key={addr} address={addr} type="vote" phaseFilter={phaseFilter} />
            ))}
          </div>
        </section>
      )}

      {totalLobbies === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <div className="text-5xl mb-4">🚀</div>
          <p className="text-gray-400 mb-2">{t('home.noLobbies')}</p>
          <p className="text-sm text-gray-600">{t('home.createFirst')}</p>
        </div>
      )}
    </div>
  )
}
