# Monad Blitz Izmir

## Project Overview
A decentralized Quiz & Vote platform on the Monad blockchain (EVM-compatible). Two modules — Quiz and Vote — each use lobby-based architecture where every session deploys as an independent smart contract.

## Architecture
- **LobbyFactory** — single entry point, deploys independent QuizLobby/VoteLobby contracts
- **QuizLobby** — per-session contract with commit-reveal, sequential question reveals, HKDF key derivation
- **VoteLobby** — per-session voting contract, commit-reveal for social influence prevention (no encryption needed)
- **AnswerVault** — stores encrypted answer hashes, co-deployed with QuizLobby
- **ScoreBoard** — compares revealed answers against correct answers, writes scores on-chain

## Key Design Decisions
- Questions stored encrypted on IPFS (AES-256-GCM), CID + key commits on-chain
- HKDF derives per-question keys from a single masterKey
- Commit-reveal on both owner side (question keys) and participant side (answers with salt)
- `revealKey()` is callable by anyone (trustless question progression)
- Question duration and reveal window are immutable (set at deploy)
- Owner stakes funds; failure to reveal answer keys distributes stake to participants

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Blockchain | Monad (EVM) |
| Contracts | Solidity |
| Encryption | AES-256-GCM |
| Key Derivation | HKDF |
| Commits | keccak256 |
| Storage | IPFS + pinning (Pinata/web3.storage) |
| Frontend | TBD (ethers.js or viem) |

## Language
Architecture docs and comments are in Turkish. Respond in Turkish when the user writes in Turkish.
