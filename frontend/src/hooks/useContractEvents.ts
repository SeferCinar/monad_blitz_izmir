import { useWatchContractEvent } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { VoteLobbyABI } from '../abi/VoteLobby'
import type { Address } from 'viem'

/**
 * QuizLobby event'lerini dinle, degisiklik olunca cache invalidate et
 */
export function useQuizEvents(lobby: Address) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries()

  useWatchContractEvent({
    address: lobby,
    abi: QuizLobbyABI,
    eventName: 'MemberJoined',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: QuizLobbyABI,
    eventName: 'QuizStarted',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: QuizLobbyABI,
    eventName: 'QuestionRevealed',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: QuizLobbyABI,
    eventName: 'RevealPhaseStarted',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: QuizLobbyABI,
    eventName: 'QuizFinished',
    onLogs: invalidate,
  })
}

/**
 * VoteLobby event'lerini dinle
 */
export function useVoteEvents(lobby: Address) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries()

  useWatchContractEvent({
    address: lobby,
    abi: VoteLobbyABI,
    eventName: 'MemberJoined',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: VoteLobbyABI,
    eventName: 'VotingStarted',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: VoteLobbyABI,
    eventName: 'VoteRevealed',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: VoteLobbyABI,
    eventName: 'RevealPhaseStarted',
    onLogs: invalidate,
  })

  useWatchContractEvent({
    address: lobby,
    abi: VoteLobbyABI,
    eventName: 'VotingFinished',
    onLogs: invalidate,
  })
}
