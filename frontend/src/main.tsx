import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/wagmi'
import { LanguageProvider } from './i18n/LanguageContext'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </LanguageProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
