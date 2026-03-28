import { keccak256, toHex } from 'viem'

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

export type QuizQuestion = {
  index: number
  question: string
  options: string[]
  correctAnswer: string
}

export type EncryptedQuestion = {
  index: number
  encryptedPayload: string
  iv: string
}

export type IpfsQuizPayload = {
  quizId: string
  questions: EncryptedQuestion[]
}

/**
 * IPFS'ten quiz payload'unu fetch et (CID string olarak gelir, URL param'dan)
 */
export async function fetchFromIpfs(cid: string): Promise<IpfsQuizPayload> {
  const res = await fetch(`${IPFS_GATEWAY}${cid}`)
  if (!res.ok) throw new Error(`IPFS fetch basarisiz: ${res.status}`)
  return res.json()
}

/**
 * Pinata'ya yukle (.env'den JWT okur)
 */
export async function uploadToIpfs(
  payload: IpfsQuizPayload,
): Promise<string> {
  const pinataJwt = import.meta.env.VITE_PINATA_JWT
  if (!pinataJwt) throw new Error('VITE_PINATA_JWT env degiskeni tanimli degil.')

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pinataJwt}`,
    },
    body: JSON.stringify({
      pinataContent: payload,
      pinataMetadata: { name: `quiz-${payload.quizId}` },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Pinata upload basarisiz: ${errText}`)
  }

  const data = await res.json()
  return data.IpfsHash as string
}

/**
 * CID'yi keccak256 ile hash'le — on-chain commitment olarak kullanilir.
 * Gercek CID, URL parametresinde tasinir.
 */
export function cidToBytes32(cid: string): `0x${string}` {
  return keccak256(toHex(cid))
}
