import { useParams } from 'react-router-dom'
import { useReadContract, useReadContracts } from 'wagmi'
import { VoteLobbyABI } from '../abi/VoteLobby'
import { formatEther, type Address, keccak256, encodePacked } from 'viem'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTxFeedback } from '../hooks/useTxFeedback'
import { useVoteEvents } from '../hooks/useContractEvents'
import WalletGuard from '../components/WalletGuard'
import TxToast from '../components/TxToast'
import SaltInput from '../components/SaltInput'
import CountdownTimer from '../components/CountdownTimer'
import MemberList from '../components/MemberList'

const PHASE_LABELS = ['Beklemede', 'Oylama', 'Reveal', 'Bitti'] as const
const PHASE_COLORS = ['text-yellow-400', 'text-green-400', 'text-blue-400', 'text-gray-500'] as const

export default function VoteLobbyPage() {
  const { address: lobbyAddr } = useParams<{ address: string }>()
  const lobby = lobbyAddr as Address
  const { address: userAddr } = useAuth()

  useVoteEvents(lobby)

  const { data: owner } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'owner' })
  const { data: phase } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'phase' })
  const { data: optionCount } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'optionCount' })
  const { data: voteDuration } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'voteDuration' })
  const { data: revealWindow } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'revealWindow' })
  const { data: stake } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'stake' })
  const { data: memberCount } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'memberCount' })
  const { data: totalRevealed } = useReadContract({ address: lobby, abi: VoteLobbyABI, functionName: 'totalRevealed' })
  const { data: isMember } = useReadContract({
    address: lobby, abi: VoteLobbyABI, functionName: 'isMember', args: userAddr ? [userAddr] : undefined,
    query: { enabled: !!userAddr },
  })
  const { data: voteStartTime } = useReadContract({
    address: lobby, abi: VoteLobbyABI, functionName: 'voteStartTime',
    query: { enabled: phase !== undefined && Number(phase) === 1 },
  })
  const { data: revealDeadline } = useReadContract({
    address: lobby, abi: VoteLobbyABI, functionName: 'revealDeadline',
    query: { enabled: phase !== undefined && Number(phase) === 2 },
  })

  const optCount = optionCount !== undefined ? Number(optionCount) : 0
  const { data: tallyResults } = useReadContracts({
    contracts: Array.from({ length: optCount }, (_, i) => ({
      address: lobby,
      abi: VoteLobbyABI,
      functionName: 'getVoteTally' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: phase !== undefined && Number(phase) === 3 },
  })

  const { writeContract, loading, toast, dismissToast } = useTxFeedback()

  const [selectedOption, setSelectedOption] = useState('')
  const [salt, setSalt] = useState('')
  const [savedCommit, setSavedCommit] = useState<{ option: string; salt: string } | null>(null)
  const [showMembers, setShowMembers] = useState(false)

  const phaseIdx = phase !== undefined ? Number(phase) : 0
  const isOwner = userAddr && owner && userAddr.toLowerCase() === owner.toLowerCase()
  const memCount = memberCount !== undefined ? Number(memberCount) : 0

  // Timer deadlines
  const vDuration = voteDuration !== undefined ? Number(voteDuration) : 0
  const vStart = voteStartTime !== undefined ? Number(voteStartTime) : 0
  const voteDeadline = vStart > 0 ? vStart + vDuration : undefined
  const revealDl = revealDeadline !== undefined ? Number(revealDeadline) : undefined

  const handleJoin = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'joinLobby' })
  const handleStartVoting = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'startVoting' })
  const handleEndVoting = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'endVoting' })

  const handleCommitVote = () => {
    if (selectedOption === '' || !salt) return
    const commitment = keccak256(encodePacked(['uint256', 'bytes32'], [BigInt(selectedOption), salt as `0x${string}`]))
    setSavedCommit({ option: selectedOption, salt })
    writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'commitVote', args: [commitment] })
  }

  const handleRevealVote = () => {
    const opt = savedCommit?.option || selectedOption
    const s = savedCommit?.salt || salt
    if (opt === '' || !s) return
    writeContract({
      address: lobby, abi: VoteLobbyABI, functionName: 'revealVote',
      args: [BigInt(opt), s as `0x${string}`],
    })
  }

  const handleFinish = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'finishVoting' })
  const handleWithdraw = () => writeContract({ address: lobby, abi: VoteLobbyABI, functionName: 'withdrawStake' })

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Oylama Lobisi</h1>
        <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${PHASE_COLORS[phaseIdx]}`}>
          {PHASE_LABELS[phaseIdx]}
        </span>
        {isOwner && <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">Owner</span>}
        {isMember && !isOwner && <span className="rounded-md bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Uye</span>}

        {phaseIdx === 1 && <CountdownTimer deadline={voteDeadline} label="Oylama suresi:" />}
        {phaseIdx === 2 && revealDl && <CountdownTimer deadline={revealDl} label="Reveal suresi:" />}
      </div>

      {/* Info Grid */}
      <div className="mb-6 grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 sm:grid-cols-3">
        <Info label="Adres" value={lobby} mono />
        <Info label="Owner" value={owner ? `${(owner as string).slice(0, 8)}...${(owner as string).slice(-6)}` : '...'} mono />
        <Info label="Secenek Sayisi" value={optCount.toString()} />
        <Info label="Oylama Suresi" value={voteDuration !== undefined ? formatDuration(Number(voteDuration)) : '...'} />
        <Info label="Reveal Penceresi" value={revealWindow !== undefined ? formatDuration(Number(revealWindow)) : '...'} />
        <Info label="Stake" value={stake !== undefined ? `${formatEther(stake)} MON` : '...'} />
        <Info label="Uye Sayisi" value={memCount.toString()} />
        <Info label="Toplam Reveal" value={totalRevealed !== undefined ? String(Number(totalRevealed)) : '0'} />
      </div>

      {/* Member list */}
      <div className="mb-4">
        <button
          onClick={() => setShowMembers(!showMembers)}
          className="text-sm text-gray-400 hover:text-gray-200"
        >
          {showMembers ? 'Uye listesini gizle' : `Uyeleri goster (${memCount})`}
        </button>
        {showMembers && memCount > 0 && (
          <div className="mt-2">
            <MemberList lobbyAddress={lobby} memberCount={memCount} owner={owner as string} abi={VoteLobbyABI as unknown as import('viem').Abi} />
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* PENDING */}
        {phaseIdx === 0 && (
          <WalletGuard fallbackMessage="Lobiye katilmak veya oylamayi baslatmak icin cuzdan bagla.">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Islemler</h2>
              {!isMember && !isOwner && (
                <div className="mb-3">
                  <p className="mb-2 text-sm text-gray-400">Bu oylamaya katilmak ister misin?</p>
                  <ActionButton onClick={handleJoin} loading={loading}>Lobiye Katil</ActionButton>
                </div>
              )}
              {isMember && (
                <div className="flex items-center gap-2 rounded-lg bg-green-900/20 border border-green-800/30 px-4 py-2.5">
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                  <p className="text-sm text-green-300">Bu lobinin uyesisin. Oylamanin baslamasini bekliyorsun.</p>
                </div>
              )}
              {isOwner && (
                <div className="mt-3">
                  <p className="mb-2 text-sm text-gray-400">Uyeler hazir oldugunda oylamayi baslat.</p>
                  <ActionButton onClick={handleStartVoting} loading={loading}>Oylamayi Baslat</ActionButton>
                </div>
              )}
            </div>
          </WalletGuard>
        )}

        {/* VOTING */}
        {phaseIdx === 1 && (
          <div className="space-y-4">
            {isMember && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">Oy Ver (commit)</h2>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Secenek</label>
                    <select
                      value={selectedOption}
                      onChange={(e) => setSelectedOption(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">Sec...</option>
                      {Array.from({ length: optCount }, (_, i) => (
                        <option key={i} value={i}>Secenek {i}</option>
                      ))}
                    </select>
                  </div>
                  <SaltInput value={salt} onChange={setSalt} />
                </div>
                <ActionButton onClick={handleCommitVote} loading={loading}>Commit Et</ActionButton>
                <p className="mt-2 text-xs text-yellow-400">Salt'ini ve seciminizi kaydedin! Reveal'da lazim olacak.</p>
              </div>
            )}

            {!isMember && !isOwner && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-900/50 p-5 text-center">
                <p className="text-sm text-gray-500">Bu lobinin uyesi degilsin. Sadece izleyebilirsin.</p>
              </div>
            )}

            <WalletGuard>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
                <p className="text-sm text-gray-400">Oylama suresi dolduysa reveal'a gec.</p>
                <ActionButton onClick={handleEndVoting} loading={loading}>Oylamayi Bitir</ActionButton>
              </div>
            </WalletGuard>
          </div>
        )}

        {/* REVEAL */}
        {phaseIdx === 2 && (
          <div className="space-y-4">
            {isMember && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-3 text-lg font-semibold text-white">Oyunu Ac (reveal)</h2>

                {savedCommit && (
                  <div className="mb-3 rounded-lg bg-gray-800/50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Kayitli commit'in:</p>
                    <p className="text-sm text-gray-300">Secenek {savedCommit.option}, Salt: <span className="font-mono text-xs">{savedCommit.salt.slice(0, 14)}...</span></p>
                  </div>
                )}

                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Secenek</label>
                    <select
                      value={savedCommit?.option || selectedOption}
                      onChange={(e) => { setSelectedOption(e.target.value); setSavedCommit(null) }}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">Sec...</option>
                      {Array.from({ length: optCount }, (_, i) => (
                        <option key={i} value={i}>Secenek {i}</option>
                      ))}
                    </select>
                  </div>
                  <SaltInput value={savedCommit?.salt || salt} onChange={(v) => { setSalt(v); setSavedCommit(null) }} label="Commit Salt" />
                </div>
                <ActionButton onClick={handleRevealVote} loading={loading}>Reveal Et</ActionButton>
              </div>
            )}

            <WalletGuard>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
                <p className="text-sm text-gray-400">Reveal suresi dolduysa oylamayi sonlandir.</p>
                <ActionButton onClick={handleFinish} loading={loading}>Oylamayi Sonlandir</ActionButton>
              </div>
            </WalletGuard>
          </div>
        )}

        {/* FINISHED */}
        {phaseIdx === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Sonuclar</h2>
              <div className="space-y-2">
                {tallyResults?.map((result, i) => {
                  const votes = result.status === 'success' ? Number(result.result) : 0
                  const total = totalRevealed !== undefined ? Number(totalRevealed) : 0
                  const pct = total > 0 ? ((votes / total) * 100).toFixed(1) : '0'
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-gray-400">Secenek {i}</span>
                      <div className="flex-1 rounded-full bg-gray-800 h-6 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-sm text-gray-300">{votes} oy ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {isOwner && (
              <WalletGuard>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
                  <p className="text-sm text-gray-400">Stake'ini geri cek.</p>
                  <ActionButton onClick={handleWithdraw} loading={loading}>Stake Cek</ActionButton>
                </div>
              </WalletGuard>
            )}
          </div>
        )}
      </div>

      <TxToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm text-gray-200 ${mono ? 'font-mono break-all' : ''}`}>{value}</p>
    </div>
  )
}

function ActionButton({ onClick, loading, children }: { onClick: () => void; loading: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? 'Isleniyor...' : children}
    </button>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}dk ${s}s` : `${m}dk`
}
