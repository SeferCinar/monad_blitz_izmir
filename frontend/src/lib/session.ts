/**
 * Quiz oturum verilerini localStorage'da saklar.
 * Kullaniciya hissettirmeden master key, dogru cevaplar ve commit'leri yonetir.
 */

export type QuizSession = {
  masterKey: string        // 0x-prefixed hex, HKDF master key
  correctAnswers: string[] // Her soru icin dogru cevap metni
  cid: string              // Gercek IPFS CID (fetch icin)
}

export type AnswerCommit = {
  answer: string
  salt: string    // 0x-prefixed hex bytes32
  revealed: boolean
}

function sessionKey(lobbyAddr: string) {
  return `quiz-session-${lobbyAddr.toLowerCase()}`
}

function answersKey(lobbyAddr: string) {
  return `quiz-answers-${lobbyAddr.toLowerCase()}`
}

export function saveQuizSession(lobbyAddr: string, session: QuizSession): void {
  localStorage.setItem(sessionKey(lobbyAddr), JSON.stringify(session))
}

export function loadQuizSession(lobbyAddr: string): QuizSession | null {
  const raw = localStorage.getItem(sessionKey(lobbyAddr))
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function saveAnswerCommit(lobbyAddr: string, questionIndex: number, commit: Omit<AnswerCommit, 'revealed'>): void {
  const all = loadAnswerCommits(lobbyAddr)
  all[questionIndex] = { ...commit, revealed: false }
  localStorage.setItem(answersKey(lobbyAddr), JSON.stringify(all))
}

export function loadAnswerCommits(lobbyAddr: string): Record<number, AnswerCommit> {
  const raw = localStorage.getItem(answersKey(lobbyAddr))
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export function markRevealed(lobbyAddr: string, questionIndex: number): void {
  const all = loadAnswerCommits(lobbyAddr)
  if (all[questionIndex]) {
    all[questionIndex].revealed = true
    localStorage.setItem(answersKey(lobbyAddr), JSON.stringify(all))
  }
}

// Quiz'in gercek IPFS CID'sini cache'le (URL param'dan gelen herkese)
export function saveCid(lobbyAddr: string, cid: string): void {
  localStorage.setItem(`quiz-cid-${lobbyAddr.toLowerCase()}`, cid)
}

export function loadCid(lobbyAddr: string): string {
  return localStorage.getItem(`quiz-cid-${lobbyAddr.toLowerCase()}`) ?? ''
}
