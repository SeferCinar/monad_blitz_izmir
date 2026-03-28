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
 * IPFS'ten quiz payload'unu fetch et
 */
export async function fetchFromIpfs(cidHex: string): Promise<IpfsQuizPayload> {
  // bytes32 CID'yi string'e cevir (null byte'lari sil)
  const cidBytes = cidHex.startsWith('0x') ? cidHex.slice(2) : cidHex
  const cid = new TextDecoder().decode(
    Uint8Array.from(cidBytes.match(/.{2}/g)!.map((b) => parseInt(b, 16)).filter((b) => b !== 0))
  )

  const res = await fetch(`${IPFS_GATEWAY}${cid}`)
  if (!res.ok) throw new Error(`IPFS fetch basarisiz: ${res.status}`)
  return res.json()
}

/**
 * Pinata'ya yukle (API key gerekli)
 */
export async function uploadToIpfs(
  payload: IpfsQuizPayload,
  pinataJwt: string
): Promise<string> {
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
 * CID string'i bytes32 hex'e cevir (kontrat icin)
 */
export function cidToBytes32(cid: string): `0x${string}` {
  const bytes = new TextEncoder().encode(cid)
  if (bytes.length > 32) throw new Error('CID 32 byte\'a sigmaz, kisa CIDv0 kullan')
  const padded = new Uint8Array(32)
  padded.set(bytes)
  return `0x${Array.from(padded).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}
