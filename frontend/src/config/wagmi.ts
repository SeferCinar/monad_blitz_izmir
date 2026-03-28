import { http, createConfig, createStorage } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'SocialScan',
      url: 'https://monad-testnet.socialscan.io',
    },
  },
  testnet: true,
})

export const config = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  storage: createStorage({ storage: window.localStorage }),
  transports: {
    [monadTestnet.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
