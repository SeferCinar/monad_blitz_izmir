import { useReadContracts } from 'wagmi'
import { QuizLobbyABI } from '../abi/QuizLobby'
import { VoteLobbyABI } from '../abi/VoteLobby'
import type { Address, Abi } from 'viem'

type Props = {
  lobbyAddress: Address
  memberCount: number
  owner?: string
  abi?: Abi
}

export default function MemberList({ lobbyAddress, memberCount, owner, abi }: Props) {
  const usedAbi = (abi ?? QuizLobbyABI) as typeof QuizLobbyABI | typeof VoteLobbyABI

  const { data: membersData } = useReadContracts({
    contracts: Array.from({ length: memberCount }, (_, i) => ({
      address: lobbyAddress,
      abi: usedAbi,
      functionName: 'members' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: memberCount > 0 },
  })

  const members = membersData
    ?.filter((r) => r.status === 'success')
    .map((r) => r.result as Address) ?? []

  if (members.length === 0) {
    return <p className="text-sm text-gray-500">Henuz uye yok.</p>
  }

  return (
    <div className="space-y-1">
      {members.map((addr, i) => {
        const isOwnerAddr = owner && addr.toLowerCase() === owner.toLowerCase()
        return (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-800/50 px-3 py-1.5">
            <span className="font-mono text-sm text-gray-300">
              {addr.slice(0, 8)}...{addr.slice(-6)}
            </span>
            {isOwnerAddr && (
              <span className="rounded bg-purple-900/50 px-1.5 py-0.5 text-xs text-purple-300">Owner</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
