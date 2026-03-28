import bs58 from 'bs58'

const IPFS_GATEWAY = 'https://orange-obedient-jaguar-820.mypinata.cloud/ipfs/'

export type QuizQuestion = {
  index: number
  question: string
  options: string[]
  correctAnswer: string
}

export type PlaintextQuestion = {
  index: number
  question: string
  options: string[]
}

export type IpfsQuizPayload = {
  quizId: string
  name?: string
  questions: PlaintextQuestion[]
}

/**
 * IPFS'ten quiz payload'unu fetch et
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
 * CIDv0'dan SHA-256 digest'i cikar ve bytes32 olarak dondur.
 * CIDv0 = base58(0x1220 + 32-byte-digest), digest tam 32 byte = bytes32'ye sigar.
 */
export function cidToBytes32(cid: string): `0x${string}` {
  const decoded = bs58.decode(cid)
  // Ilk 2 byte multihash header: 0x12 (sha2-256) + 0x20 (32 byte)
  const digest = decoded.slice(2)
  if (digest.length !== 32) throw new Error(`Beklenmeyen digest uzunlugu: ${digest.length}`)
  return `0x${Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * On-chain bytes32'den CIDv0'i geri olustur.
 * bytes32 → 0x1220 + digest → base58 encode → "Qm..."
 */
export function bytes32ToCid(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const digest = Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
  // Multihash header ekle: 0x12 (sha2-256) + 0x20 (32 byte length)
  const multihash = new Uint8Array(34)
  multihash[0] = 0x12
  multihash[1] = 0x20
  multihash.set(digest, 2)
  return bs58.encode(multihash)
}
