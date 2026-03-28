/**
 * Rastgele 32 byte uretir (salt, masterKey vb.)
 */
export function generateRandomBytes32(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Hex string'den Uint8Array'e cevir
 */
export function hexToKey(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Uint8Array'den 0x-prefixed hex string'e cevir
 */
export function keyToHex(key: Uint8Array): `0x${string}` {
  return `0x${Array.from(key).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * HKDF-SHA256 ile masterKey'den soru anahtari turetir.
 * Web Crypto API kullanir (noble/hashes yerine).
 */
export async function deriveQuestionKey(masterKey: Uint8Array, questionIndex: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', masterKey as BufferSource, 'HKDF', false, ['deriveBits'])
  const info = new TextEncoder().encode(`question-${questionIndex}`)
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

/**
 * AES-256-GCM ile sifrele
 */
export async function encryptAesGcm(
  plaintext: string,
  key: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt'])
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded)

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  }
}

/**
 * AES-256-GCM ile coz
 */
export async function decryptAesGcm(
  ciphertextB64: string,
  ivB64: string,
  key: Uint8Array
): Promise<string> {
  const ciphertext = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0))
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt'])
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)
  return new TextDecoder().decode(decrypted)
}

/**
 * MasterKey'den tum soru anahtarlarini ve commit hash'lerini uret
 */
export async function generateQuizKeys(masterKeyHex: string, questionCount: number) {
  const masterKey = hexToKey(masterKeyHex)
  const keys: { key: Uint8Array; hex: `0x${string}` }[] = []

  for (let i = 0; i < questionCount; i++) {
    const key = await deriveQuestionKey(masterKey, i)
    keys.push({ key, hex: keyToHex(key) })
  }

  return keys
}
