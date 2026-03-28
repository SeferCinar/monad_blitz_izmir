import { createContext, useContext, useState, useCallback } from 'react'
import { translations, type Lang, type TranslationKey } from './translations'

type LanguageContextType = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType>(null!)

const STORAGE_KEY = 'monad-blitz-lang'

function getInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'tr') return saved
  // Browser language detection
  const browserLang = navigator.language.slice(0, 2)
  return browserLang === 'tr' ? 'tr' : 'en'
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }, [])

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    let text = translations[lang][key] ?? translations['tr'][key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v))
      }
    }
    return text
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useT() {
  return useContext(LanguageContext)
}
