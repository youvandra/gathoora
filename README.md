# GATHOORA

We’re building a new kind of knowledge economy, one where human expertise isn’t buried in PDFs, lost in group chats, or diluted by generic AI models. Instead, every insight, every discovery, every hard-earned piece of understanding becomes a plug-and-play module you can rent, use, and get paid for instantly. Users get AI responses powered by real experts, not generic training data. Creators earn directly from every chat. And through our Debate Arena, knowledge isn’t just uploaded, it’s proven, rated, and battle-tested. This is where human intelligence becomes a living marketplace, and every conversation has real value.

## Monorepo Structure
- `apps/api` — Express API server (Hedera, Supabase, x402 payment flow)
- `apps/web` — Next.js frontend (wallet connect, marketplace, arena)
- `apps/facilitator` — x402 facilitator proxy (optional upstream)
- `supabase/` — SQL migrations and policies
- `.env.example` — environment variables template

## Quick Start
- Prereqs: Node 18+, a Supabase project, Hedera testnet/mainnet account, HashPack WalletConnect project ID
- Setup:
  - Copy `.env.example` → `.env` and fill values
  - Start API: `npm run dev --workspace=apps/api`
  - Start Facilitator (optional): `npm run dev --workspace=apps/facilitator`
  - Start Web: `npm run dev --workspace=apps/web`
- Default ports: API `:4000`, Web `:3000`, Facilitator `:3000` (override via `PORT`)

## Environment Variables
See `.env.example` for full list.
- Supabase:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server SDK
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client SDK
- Hedera & WalletConnect:
  - `HEDERA_NETWORK` — `testnet` or `mainnet`
  - `NEXT_PUBLIC_HASHPACK_NETWORK` — wallet network for UI
  - `NEXT_PUBLIC_WC_PROJECT_ID`, `NEXT_PUBLIC_WC_RELAY_URL` — WalletConnect v2
- Token and Treasury:
  - `COK_TOKEN_ID` — Hedera token used for payments
  - `COK_TREASURY_ACCOUNT_ID`, `COK_TREASURY_PRIVATE_KEY` — treasury as spender for approved transfers
  - `COK_MINT_TINY_AMOUNT`, `COK_SUPPLY_PRIVATE_KEY` — mint utility
- API/Web:
  - `PORT` (API), `NEXT_PUBLIC_API_URL` (Web)
- Facilitator:
  - `FACILITATOR_URL` (used by API/playground x402 flows)
  - Facilitator specific: `EVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY`, `HEDERA_PRIVATE_KEY`, `HEDERA_ACCOUNT_ID`, `FACILITATOR_UPSTREAM`
- Misc:
  - `ADDRESS` — treasury/fee payer account id used in approved transfer fallback

## Apps

### API (`apps/api`)
- Scripts: `dev`, `build`, `typecheck` (`apps/api/package.json:5-9`)
- Entry: `src/index.ts` — Express + Hedera SDK + Supabase
- Integrations:
  - Hedera token association, direct token transfers, approved transfers
  - x402 payment middleware for 402 flows
  - Supabase RLS for `activities` and `rent_activities`

#### Key Endpoints (base: `http://localhost:4000`)
- Custodial:
  - `POST /custodial/create` — create custodial wallet
  - `POST /custodial/associate` — associate token to custodial account
  - `POST /custodial/ensure` — ensure custodial wallet exists
  - `POST /custodial/check` — check if an account is custodial
- Knowledge Packs:
  - `POST /knowledge-packs` — create
  - `GET /knowledge-packs` — list (optional `?accountId=`)
  - `POST /knowledge-packs/chat` — chat with a pack
  - `PUT /knowledge-packs/:id` — update
  - `DELETE /knowledge-packs/:id` — delete
- Playground:
  - `POST /playground/chat` — chat with selected owned/rented packs
- x402 (Hedera payment helper):
  - `POST /x402/prepare-transfer` — prepare transfer bytes
  - `POST /x402/check-allowance` — check allowance for spender
  - `POST /x402/submit-transfer` — submit signed transfer
- Marketplace:
  - `GET /marketplace/listings` — list all
  - `POST /marketplace/listings` — create listing (rent price, per‑use price)
  - `GET /marketplace/listings/:id` — get listing by id
  - `GET /marketplace/listings/by-pack/:packId` — get by pack id
  - `POST /marketplace/listings/update` — update listing
  - `POST /marketplace/unlist` — unlist listing
  - `GET /marketplace/rental-status?listingId&accountId` — check rental active
  - `POST /marketplace/rent` — rent for minutes (on‑chain payment)
  - `POST /marketplace/chat` — chat with listing’s knowledge pack
- Agents:
  - `POST /agents` — create
  - `GET /agents` — list (optional `?ownerAccountId=`)
  - `PUT /agents/:id` — update
  - `DELETE /agents/:id` — delete
  - `GET /agents/:id/knowledge-packs` — list attached packs
  - `POST /agents/:id/knowledge-packs` — add pack
  - `DELETE /agents/:id/knowledge-packs/:kpId` — remove pack
- Matches & Arenas:
  - `POST /matches` — create match
  - `GET /matches`, `GET /matches/:id`
  - `POST /arenas` — create arena (game type `import` or `challenge`)
  - `GET /arenas`, `GET /arenas/:id`, `GET /arenas/code/:code`
  - `GET /arenas/watchers?accountId` — list arenas watched by account
  - `POST /arenas/join`, `POST /arenas/watch`, `DELETE /arenas/:id`
  - `POST /arenas/select` — pick agent for side
  - `POST /arenas/ready` — mark ready
  - `POST /arenas/submit-knowledge` — submit writing in challenge
  - `POST /arenas/cancel` — cancel
  - `POST /arenas/challenge-control` — start/pause/resume/finish
  - `POST /arenas/save-draft` — save draft
  - `POST /arenas/start` — start auto‑debate
  - `GET /arenas/:id/stream` — SSE stream of auto‑debate
- Tokens:
  - `POST /tokens/mint-cok` — mint demo `COK` token to account
- Leaderboard & Users:
  - `GET /leaderboard` — list top accounts
  - `POST /users/name` — update display name
- Activities:
  - `GET /activities?accountId` — list chat activities for user
  - `GET /rent-activities?accountId` — list rent activity history for user

#### Hedera Deployed
COK TOKEN = 0.0.7284519
HCS_ELO_TOPIC_ID = 0.0.7291514
HCS_KNOWLEDGE_TOPIC_ID = 0.0.7292283

#### Hedera Payment Flow
- Direct Transfer (if user’s private key is available):
  - Associate token, then execute a `TransferTransaction` from renter → owner
  - Transaction IDs recorded to `rent_activities.transaction_ids` (`apps/api/src/index.ts:960-988`)
- x402 Header Execution:
  - Accepts `X-PAYMENT` header with `signedTransaction` (HashConnect flow)
  - Executes bytes and records transaction ID (`apps/api/src/index.ts:1030-1036`)
- Approved Transfer Fallback:
  - Uses treasury as spender to perform `addApprovedTokenTransfer`
  - Records transaction ID (`apps/api/src/index.ts:1047-1073`)

#### Supabase & RLS
- Tables used (examples): `knowledge_packs`, `agents`, `arenas`, `users`, `activities`, `rent_activities`, `custodial_wallets`
- RLS policies:
  - `activities` — only owner (via Supabase `auth.uid()` ↔ custodial mapping)
  - `rent_activities` — `renter_account_id` matched via custodial wallets
- Migrations:
  - RLS enablement and select policies in `supabase/migrations/*_rls.sql`

### Web (`apps/web`)
- Scripts: `dev`, `build`, `start`, `typecheck` (`apps/web/package.json:5-10`)
- Pages and Features:
  - `/` Home — connect via HashConnect or Google (custodial wallet provisioning)
  - `/marketplace` — browse listings; Rent or Use; History modal with Hashscan links (`apps/web/pages/marketplace.tsx`)
  - `/packs` — manage knowledge and agents; list/unlist marketplace
  - `/playground` — multi‑source chat; per‑use payments with x402/HashConnect
  - `/arena` — create/join arenas; challenge mode with timers; auto‑debate stream
  - `/profile` — token balance and association helper
  - `/leaderboard` — top accounts by ELO
  - `/upload` — quick upload for knowledge/agents
- Wallet & Payments:
  - HashConnect WalletConnect v2 for signing transactions
  - `NEXT_PUBLIC_HASHPACK_NETWORK` selects `LedgerId` (mainnet/testnet)
  - Stores selections in `localStorage` (`playground_sources:<accountId>`) for convenience

### Facilitator (`apps/facilitator`)
- Scripts: `dev`, `lint`, `format` (`apps/facilitator/package.json:5-17`)
- Entry: `index.ts`
  - `GET /supported` — returns supported x402 kinds (hedera testnet/mainnet with fee payer)
  - `POST /verify` — proxies to upstream `/verify`
  - `POST /settle` — proxies to upstream `/settle`
- Env:
  - Provide `HEDERA_PRIVATE_KEY` + `HEDERA_ACCOUNT_ID` for Hedera support
  - `FACILITATOR_UPSTREAM` default: `https://x402-hedera-production.up.railway.app`

## Running Locally
- API:
  - `npm run dev --workspace=apps/api`
  - Base URL: `http://localhost:4000`
- Facilitator:
  - `npm run dev --workspace=apps/facilitator`
  - Default: `http://localhost:3000` (set `PORT` to align with `.env FACILITATOR_URL`)
- Web:
  - `npm run dev --workspace=apps/web`
  - Base URL: `http://localhost:3000`

## Payments & Allowances
- Custodial accounts detected server‑side; direct signing used where possible
- Non‑custodial users can:
  - Approve allowance and rely on approved transfer fallback
  - Or sign via HashConnect; client sets `X-PAYMENT` header in Playground
- Allowance checks are skipped for custodial accounts in frontend Playground

## Hashscan Links in History
- Rent history shows a Hashscan link for each activity when `transaction_ids` are present
- Network inferred from `rent_activities.network` (`mainnet`/`testnet`)

## Features
- Create Packs (Knowledge & Agents): manage knowledge and agents; attach/detach packs to agents; update or delete as needed (`POST /knowledge-packs`, `POST /agents`, `GET/PUT/DELETE` variants; web `/packs`).
- Create Arena: open a new arena with topic and game type `import` or `challenge` (`POST /arenas` at `apps/api/src/index.ts:1348-1355`; web `/arena`).
- Join Arena: join by `id` or `code`, then mark ready and select sides/agents (`POST /arenas/join` at `apps/api/src/index.ts:1451-1475`, `POST /arenas/ready` at `apps/api/src/index.ts:1522-1550`, `POST /arenas/select` at `apps/api/src/index.ts:1509-1517`; web `/arena`).
- List to Marketplace: list a knowledge pack with per‑minute rent price and optional per‑use chat price (`POST /marketplace/listings`; web `/marketplace`).
- Rent Knowledge: pay on‑chain to rent a listing for minutes; history includes Hashscan links (`POST /marketplace/rent` at `apps/api/src/index.ts:872-1110`; web `/marketplace`).
- Leaderboard: see top accounts by ELO rating (`GET /leaderboard` at `apps/api/src/index.ts:1769-1776`; web `/leaderboard`).
- Profile: view token balance, associate token if needed, counts for Agents/Knowledge, and ELO (`apps/web/pages/profile.tsx:37-69,269-284`).
- Pay Per Chat/Use: per‑use billing in Playground and Marketplace chat using x402 or direct transfer (`POST /playground/chat` at `apps/api/src/index.ts:329-412` for x402 requirement generation; `POST /marketplace/chat`).

## Judge System
- Factors (0–10 each side): argument strength; factual accuracy; direct response; coherence & structure; persuasiveness; logical fallacies (higher is fewer fallacies); rebuttal efficiency; final position (`apps/api/src/services/judge.ts:5-6`).
- Weights: argument_strength 0.34; factual_accuracy 0.25; direct_response 0.18; rebuttal_efficiency 0.12; persuasiveness 0.07; final_position 0.10 (`apps/api/src/services/judge.ts:17-24`).
- Fallacy penalty: subtract up to 0.06 based on detected fallacies per side (`apps/api/src/services/judge.ts:25-28`).
- Aggregation: trimmed mean across multiple judges (drop min and max when 4+ judges) (`apps/api/src/services/judge.ts:56-68`).
- Conclusion: concise neutral summary generated after judging (`apps/api/src/services/judge.ts:71-76`).
- Usage in matches/arenas: scores aggregated to pick winner and persist match (`apps/api/src/index.ts:1311-1316`, `apps/api/src/index.ts:1744-1749`, `apps/api/src/index.ts:1898-1901`).

## ELO Rating
- Formula: `E = 1/(1+10^((opp - you)/400))`; `R' = R + k*(score - E)` with `k=32` (`apps/api/src/services/elo.ts:1-7`).
- Inputs: `score` is 1 for winner, 0 for loser, 0.5 for draw.
- Updates occur after match creation or arena completion/streamed debate generation (`apps/api/src/index.ts:1324-1330`, `apps/api/src/index.ts:1756-1761`, `apps/api/src/index.ts:1909-1914`).
- Leaderboard reads user ELO from storage (`GET /leaderboard` at `apps/api/src/index.ts:1769-1776`).

## Testing & Typechecking
- API typecheck: `npm run typecheck --workspace=apps/api`
- Web typecheck: `npm run typecheck --workspace=apps/web`

## Notes
- Do not commit secrets. Use environment variables.
- Supabase RLS requires JWT auth in the frontend for protected queries.
- Ensure `COK_TOKEN_ID` is associated with renter accounts before transfers.
