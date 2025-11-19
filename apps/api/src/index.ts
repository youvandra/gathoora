import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { z } from 'zod'
import { db, persistenceInfo } from './db'
import { RoundEntry, RoundName } from './types'
import { generateText } from './services/openai'
import { judgeDebate, aggregateJudgeScores, judgeConclusion } from './services/judge'
import { calculateElo } from './services/elo'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))
const generating = new Set<string>()

function systemPrompt(name: string, r: RoundName) {
  if (r === 'opening') return `You are ${name}. Use only the provided knowledge. Present your stance clearly. Establish position in 3–5 short, well-ordered points or 1–2 compact paragraphs. Do not include any labels or stage names; never write words like "round", "opening", "rebuttal", "crossfire", or "closing". Output only the content. If absolutely no usable content exists, reply "unknown".`
  if (r === 'direct_arguments') return `You are ${name}. Use only the provided knowledge. Give your main argument: strongest points, evidence, and reasoning. Use structured numbered points or short paragraphs. Do not include any labels or stage names; never write words like "round", "opening", "rebuttal", "crossfire", or "closing". Output only the content. If absolutely no usable content exists, reply "unknown".`
  if (r === 'rebuttals') return `You are ${name}. Use only the provided knowledge. Rebut the opponent: directly attack and dismantle opposite points with evidence from the knowledge. Keep it precise in short paragraphs or numbered lines. Do not include any labels or stage names; never write words like "round", "opening", "rebuttal", "crossfire", or "closing". Output only the content. If absolutely no usable content exists, reply "unknown".`
  if (r === 'counter_rebuttals') return `You are ${name}. Use only the provided knowledge. Provide a shorter, more focused counter to the opponent's rebuttal — a compact counter‑punch that addresses their strongest rebuttal point. 2–3 tight sentences or 2–3 numbered mini‑points. Do not include any labels or stage names; never write words like "round", "opening", "rebuttal", "crossfire", or "closing". Output only the content. If absolutely no usable content exists, reply "unknown".`
  if (r === 'question_crossfire') return `You are ${name}. Use only the provided knowledge. Ask 1–2 critical questions that expose weaknesses or demand clarity from the opponent. Only output the questions as concise numbered lines. Do not include answers or labels; never write words like "question" or "answer" or any stage names. Output only the content. If absolutely no usable content exists, reply "unknown".`
  if (r === 'answer_crossfire') return `You are ${name}. Use only the provided knowledge. Respond crisply to the opponent's questions in 1–2 concise answers or numbered lines. Provide direct, evidence‑backed replies. Do not include any labels; never write words like "question" or "answer" or any stage names. Output only the content. If absolutely no usable content exists, reply "unknown".`
  return `You are ${name}. Use only the provided knowledge. Give final arguments: summarize and conclude your stance with a strong, compact closing in 1–2 short paragraphs. Tighten logic and deliver the final punch. Do not include any labels or stage names; never write words like "round", "opening", "rebuttal", "crossfire", or "closing". Output only the content. If absolutely no usable content exists, reply "unknown".`
}

app.get('/health', (req: Request, res: Response) => {
  res.json({ ok: true, supabase: persistenceInfo.useSupabase })
})

app.post('/custodial/create', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ userId: z.string(), email: z.string().optional(), provider: z.string().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const network = (process.env.HEDERA_NETWORK || process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet').toLowerCase()
    const tokenIdStr = process.env.COK_TOKEN_ID || '0.0.7284519'
    const treasuryIdStr = process.env.COK_TREASURY_ACCOUNT_ID
    const treasuryKeyStr = process.env.COK_TREASURY_PRIVATE_KEY
    if (!treasuryIdStr || !treasuryKeyStr) return res.status(500).json({ error: 'Server not configured for custodial' })
    const sdk = await import('@hashgraph/sdk')
    const { Client, AccountId, PrivateKey, PublicKey, TokenId, Hbar, AccountCreateTransaction, TokenAssociateTransaction } = sdk as any
    const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()
    const treSrc = String(treasuryKeyStr || '')
    const treasuryId = AccountId.fromString(treasuryIdStr)
    const treasuryKey = PrivateKey.fromStringECDSA(treSrc)
    client.setOperator(treasuryId, treasuryKey)

    const accountKey = PrivateKey.generateECDSA()
    const pub = accountKey.publicKey
    const txCreate = new AccountCreateTransaction()
      .setKey(pub)
      .setInitialBalance(new Hbar(1))
    const submitCreate = await txCreate.execute(client)
    const receiptCreate = await submitCreate.getReceipt(client)
    const newAccountId = receiptCreate.accountId?.toString()
    if (!newAccountId) return res.status(500).json({ error: 'Account creation failed' })

    const tokenId = TokenId.fromString(tokenIdStr)
    const txAssoc = new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(newAccountId))
      .setTokenIds([tokenId])
      .freezeWith(client)
    const signAssoc = await txAssoc.sign(accountKey)
    const submitAssoc = await signAssoc.execute(client)
    const receiptAssoc = await submitAssoc.getReceipt(client)
    if (String(receiptAssoc.status) !== 'SUCCESS') {
      return res.status(500).json({ error: `Association failed: ${String(receiptAssoc.status)}` })
    }

    const saved = await db.upsertCustodialWallet({
      user_id: parsed.data.userId,
      email: parsed.data.email,
      provider: parsed.data.provider || 'google',
      account_id: newAccountId,
      private_key: `0x${accountKey.toStringRaw()}`,
      public_key: `0x${pub.toStringRaw()}`
    })
    res.json({ accountId: newAccountId, associated: true, wallet: saved })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/custodial/associate', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ userId: z.string() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const network = (process.env.HEDERA_NETWORK || process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet').toLowerCase()
    const tokenIdStr = process.env.COK_TOKEN_ID || '0.0.7284519'
    const treasuryIdStr = process.env.COK_TREASURY_ACCOUNT_ID
    const treasuryKeyStr = process.env.COK_TREASURY_PRIVATE_KEY
    if (!treasuryIdStr || !treasuryKeyStr) return res.status(500).json({ error: 'Server not configured for custodial' })
    const cw = await db.getCustodialWalletByUserId(parsed.data.userId)
    if (!cw || !cw.account_id || !cw.private_key) return res.status(404).json({ error: 'Custodial wallet not found or missing key' })
    const sdk = await import('@hashgraph/sdk')
    const { Client, AccountId, PrivateKey, TokenId, TokenAssociateTransaction } = sdk as any
    const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()
    const treSrc = String(treasuryKeyStr || '')
    const treasuryId = AccountId.fromString(treasuryIdStr)
    const treasuryKey = PrivateKey.fromStringECDSA(treSrc)
    client.setOperator(treasuryId, treasuryKey)
    const accountId = AccountId.fromString(String(cw.account_id))
    const privSrc = String(cw.private_key)
    const privHex = privSrc.startsWith('0x') ? privSrc.slice(2) : privSrc
    const accountKey = PrivateKey.fromStringECDSA(privHex)
    const tokenId = TokenId.fromString(tokenIdStr)
    const txAssoc = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([tokenId])
      .freezeWith(client)
    const signAssoc = await txAssoc.sign(accountKey)
    const submitAssoc = await signAssoc.execute(client)
    const receiptAssoc = await submitAssoc.getReceipt(client)
    if (String(receiptAssoc.status) !== 'SUCCESS') {
      return res.status(500).json({ error: `Association failed: ${String(receiptAssoc.status)}` })
    }
    res.json({ associated: true, accountId: accountId.toString() })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/custodial/ensure', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ userId: z.string(), email: z.string().optional(), provider: z.string().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const network = (process.env.HEDERA_NETWORK || process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet').toLowerCase()
    const tokenIdStr = process.env.COK_TOKEN_ID || '0.0.7284519'
    const treasuryIdStr = process.env.COK_TREASURY_ACCOUNT_ID
    const treasuryKeyStr = process.env.COK_TREASURY_PRIVATE_KEY
    if (!treasuryIdStr || !treasuryKeyStr) return res.status(500).json({ error: 'Server not configured for custodial' })
    const sdk = await import('@hashgraph/sdk')
    const { Client, AccountId, PrivateKey, TokenId, TokenAssociateTransaction, Hbar, AccountCreateTransaction } = sdk as any
    const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()
    const treSrc = String(treasuryKeyStr || '')
    const treasuryId = AccountId.fromString(treasuryIdStr)
    const treasuryKey = PrivateKey.fromStringECDSA(treSrc)
    client.setOperator(treasuryId, treasuryKey)

    let cw = await db.getCustodialWalletByUserId(parsed.data.userId)
    if (!cw) {
      const accountKey = PrivateKey.generateECDSA()
      const pub = accountKey.publicKey
      const txCreate = new AccountCreateTransaction()
        .setKey(pub)
        .setInitialBalance(new Hbar(1))
      const submitCreate = await txCreate.execute(client)
      const receiptCreate = await submitCreate.getReceipt(client)
      const newAccountId = receiptCreate.accountId?.toString()
      if (!newAccountId) return res.status(500).json({ error: 'Account creation failed' })
      cw = await db.upsertCustodialWallet({ user_id: parsed.data.userId, email: parsed.data.email, provider: parsed.data.provider || 'google', account_id: newAccountId, private_key: `0x${accountKey.toStringRaw()}`, public_key: `0x${pub.toStringRaw()}` })
    }

    const accountId = AccountId.fromString(String(cw.account_id))
    const tokenId = TokenId.fromString(tokenIdStr)
    const privSrc = String(cw.private_key || '')
    const privHex = privSrc.startsWith('0x') ? privSrc.slice(2) : privSrc
    const accountKey = PrivateKey.fromStringECDSA(privHex)

    try {
      const txAssoc = new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([tokenId])
        .freezeWith(client)
      const signAssoc = await txAssoc.sign(accountKey)
      const submitAssoc = await signAssoc.execute(client)
      const receiptAssoc = await submitAssoc.getReceipt(client)
      if (String(receiptAssoc.status) !== 'SUCCESS' && String(receiptAssoc.status) !== 'TOKEN_ALREADY_ASSOCIATED') {
        return res.status(500).json({ error: `Association failed: ${String(receiptAssoc.status)}` })
      }
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (!msg.includes('TOKEN_ALREADY_ASSOCIATED')) return res.status(500).json({ error: msg || 'Association error' })
    }

    res.json({ accountId: accountId.toString(), associated: true, wallet: cw })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/knowledge-packs', async (req: Request, res: Response) => {
  const schema = z.object({ title: z.string(), content: z.string(), ownerAccountId: z.string().optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const kp = await db.createKnowledgePack(parsed.data.title, parsed.data.content, parsed.data.ownerAccountId)
  res.json(kp)
})

app.get('/knowledge-packs', async (req: Request, res: Response) => {
  const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined
  const list = await db.listKnowledgePacks(accountId)
  res.json(list)
})

app.post('/knowledge-packs/chat', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ knowledgePackId: z.string(), accountId: z.string(), messages: z.array(z.object({ role: z.string(), content: z.string() })) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const kp = await db.getKnowledgePack(parsed.data.knowledgePackId)
    if (!kp) return res.status(404).json({ error: 'Knowledge not found' })
    const isOwner = String(kp.ownerAccountId || '') === String(parsed.data.accountId)
    if (!isOwner) return res.status(403).json({ error: 'Only owner can chat with own knowledge here' })
    const system = `You are a strictly scoped assistant. You MUST answer using ONLY the content provided under 'Knowledge'. If the answer is not directly supported by that content, reply exactly: "I don't know based on the provided knowledge." Do not use external information. Do not speculate. Quote or paraphrase only from 'Knowledge'.`
    const agg = kp.content
    const userLast = parsed.data.messages.slice().reverse().find(m => m.role === 'user')?.content || ''
    const prompt = `Knowledge:\n${agg}\n---\nInstructions: Answer ONLY with information contained in Knowledge. If insufficient, reply: I don't know based on the provided knowledge.\n---\nUser: ${userLast}`
    let reply = await generateText(system, prompt)
    if (!reply || reply.trim().length === 0) {
      reply = "I don't know based on the provided knowledge."
    }
    res.json({ reply })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/marketplace/listings', async (req: Request, res: Response) => {
  const list = await db.listMarketplaceListings()
  res.json(list)
})

app.post('/marketplace/listings', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ knowledgePackId: z.string(), ownerAccountId: z.string() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const kp = await db.getKnowledgePack(parsed.data.knowledgePackId)
    if (!kp) return res.status(404).json({ error: 'Knowledge not found' })
    const listing = await db.createMarketplaceListing(parsed.data.knowledgePackId, parsed.data.ownerAccountId)
    res.json(listing)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/marketplace/listings/:id', async (req: Request, res: Response) => {
  const row = await db.getMarketplaceListing(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(row)
})

app.get('/marketplace/rental-status', async (req: Request, res: Response) => {
  const listingId = String(req.query.listingId || '')
  const accountId = String(req.query.accountId || '')
  if (!listingId || !accountId) return res.status(400).json({ error: 'Missing params' })
  const r = await db.getActiveMarketplaceRental(listingId, accountId)
  res.json({ active: !!r, rental: r || null })
})

app.post('/marketplace/rent', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ listingId: z.string(), renterAccountId: z.string(), minutes: z.number().int().positive() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const listing = await db.getMarketplaceListing(parsed.data.listingId)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    if (String(listing.owner_account_id) === String(parsed.data.renterAccountId)) return res.status(400).json({ error: 'Owner cannot rent own listing' })
    const existing = await db.getActiveMarketplaceRental(parsed.data.listingId, parsed.data.renterAccountId)
    if (existing) return res.status(400).json({ error: 'Already rented and active' })
    const rental = await db.createMarketplaceRental(parsed.data.listingId, parsed.data.renterAccountId, parsed.data.minutes)
    res.json(rental)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/marketplace/chat', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ listingId: z.string(), accountId: z.string(), messages: z.array(z.object({ role: z.string(), content: z.string() })) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const listing = await db.getMarketplaceListing(parsed.data.listingId)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    const kp = await db.getKnowledgePack(String(listing.knowledge_pack_id))
    if (!kp) return res.status(404).json({ error: 'Knowledge not found' })
    const isOwner = String(listing.owner_account_id) === String(parsed.data.accountId)
    if (!isOwner) {
      const rented = await db.getActiveMarketplaceRental(parsed.data.listingId, parsed.data.accountId)
      if (!rented) return res.status(403).json({ error: 'Rental required before chat' })
    }
    const system = `You are a strictly scoped assistant. You MUST answer using ONLY the content provided under 'Knowledge'. If the answer is not directly supported by that content, reply exactly: "I don't know based on the provided knowledge." Do not use external information. Do not speculate. Quote or paraphrase only from 'Knowledge'.`
    const agg = kp.content
    const userLast = parsed.data.messages.slice().reverse().find(m => m.role === 'user')?.content || ''
    const prompt = `Knowledge:\n${agg}\n---\nInstructions: Answer ONLY with information contained in Knowledge. If insufficient, reply: I don't know based on the provided knowledge.\n---\nUser: ${userLast}`
    let reply = await generateText(system, prompt)
    if (!reply || reply.trim().length === 0) {
      reply = "I don't know based on the provided knowledge."
    }
    res.json({ reply })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.put('/knowledge-packs/:id', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ title: z.string().optional(), content: z.string().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const kp = await db.getKnowledgePack(req.params.id)
    if (!kp) return res.status(404).json({ error: 'Not found' })
    const isArena = kp.title?.toLowerCase().startsWith('arena ')
    if (isArena) return res.status(403).json({ error: 'Arena-generated knowledge cannot be edited' })
    const u = await db.updateKnowledgePack(req.params.id, parsed.data)
    if (!u) return res.status(404).json({ error: 'Not found' })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.delete('/knowledge-packs/:id', async (req: Request, res: Response) => {
  try {
    const ok = await db.deleteKnowledgePack(req.params.id)
    res.json({ ok })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/agents', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ name: z.string(), knowledgePackId: z.string().optional(), knowledgePackIds: z.array(z.string()).optional(), ownerAccountId: z.string().optional(), specialization: z.string().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const initial = parsed.data.knowledgePackId || (parsed.data.knowledgePackIds && parsed.data.knowledgePackIds[0])
    if (!initial) return res.status(400).json({ error: 'knowledgePackId or knowledgePackIds[0] is required' })
    const ag = await db.createAgent(parsed.data.name, initial, parsed.data.ownerAccountId, parsed.data.specialization)
    const rest = (parsed.data.knowledgePackIds || []).filter(id => id !== initial)
    for (const kpId of rest) await db.addAgentKnowledge(ag.id, kpId)
    const full = await db.getAgent(ag.id)
    res.json(full)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/agents', async (req: Request, res: Response) => {
  const ownerAccountId = typeof req.query.ownerAccountId === 'string' ? req.query.ownerAccountId : undefined
  if (!ownerAccountId) {
    const list = await db.listAgents()
    return res.json(list)
  }
  const list = await db.listAgents()
  const filtered = (list || []).filter(a => String(a.ownerAccountId || '') === ownerAccountId)
  res.json(filtered)
})

app.put('/agents/:id', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ name: z.string().optional(), specialization: z.string().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const u = await db.updateAgent(req.params.id, parsed.data)
    if (!u) return res.status(404).json({ error: 'Not found' })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/agents/:id/knowledge-packs', async (req: Request, res: Response) => {
  const ag = await db.getAgent(req.params.id)
  if (!ag) return res.status(404).json({ error: 'Not found' })
  res.json(ag.knowledgePackIds)
})

app.post('/agents/:id/knowledge-packs', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ knowledgePackId: z.string() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const u = await db.addAgentKnowledge(req.params.id, parsed.data.knowledgePackId)
    if (!u) return res.status(404).json({ error: 'Not found' })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.delete('/agents/:id/knowledge-packs/:kpId', async (req: Request, res: Response) => {
  try {
    const u = await db.removeAgentKnowledge(req.params.id, req.params.kpId)
    if (!u) return res.status(404).json({ error: 'Not found' })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.delete('/agents/:id', async (req: Request, res: Response) => {
  try {
    const ok = await db.deleteAgent(req.params.id)
    res.json({ ok })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/matches', async (req: Request, res: Response) => {
  const schema = z.object({ topic: z.string(), agentAId: z.string(), agentBId: z.string() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { topic, agentAId, agentBId } = parsed.data
  const agentA = await db.getAgent(agentAId)
  const agentB = await db.getAgent(agentBId)
  if (!agentA || !agentB) return res.status(404).json({ error: 'Agent not found' })
  const kpAList = (agentA.knowledgePackIds || [])
  const kpBList = (agentB.knowledgePackIds || [])
  if (!kpAList.length || !kpBList.length) return res.status(404).json({ error: 'Knowledge pack not found' })
  const kpAContents: string[] = []
  const kpBContents: string[] = []
  for (const id of kpAList) { const kp = await db.getKnowledgePack(id); if (kp) kpAContents.push(kp.content) }
  for (const id of kpBList) { const kp = await db.getKnowledgePack(id); if (kp) kpBContents.push(kp.content) }
  const aggA = kpAContents.join('\n\n---\n')
  const aggB = kpBContents.join('\n\n---\n')

  const rounds: RoundName[] = ['opening', 'direct_arguments', 'rebuttals', 'counter_rebuttals', 'question_crossfire', 'answer_crossfire', 'final_arguments']
  const entries: RoundEntry[] = []

  for (const r of rounds) {
    const prevA = entries.filter(e => e.agentId === agentA.id).map(e => `${e.round}: ${e.text}`).join('\n')
    const prevB = entries.filter(e => e.agentId === agentB.id).map(e => `${e.round}: ${e.text}`).join('\n')
    const promptA = `Topic: ${topic}\nKnowledge:\n${aggA}\nOpponent said:\n${prevB}`
    const promptB = `Topic: ${topic}\nKnowledge:\n${aggB}\nOpponent said:\n${prevA}`
    const aText = await generateText(systemPrompt(agentA.name, r), promptA)
    const bText = await generateText(systemPrompt(agentB.name, r), promptB)
    entries.push({ round: r, agentId: agentA.id, text: aText })
    entries.push({ round: r, agentId: agentB.id, text: bText })
  }

  const j1 = await judgeDebate(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'))
  const j2 = await judgeDebate(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'))
  const j3 = await judgeDebate(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'))
  const j4 = await judgeDebate(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'))

  const judgeScores = [
    { judgeId: 'judge-1', agentAScore: j1.agentAScore, agentBScore: j1.agentBScore },
    { judgeId: 'judge-2', agentAScore: j2.agentAScore, agentBScore: j2.agentBScore },
    { judgeId: 'judge-3', agentAScore: j3.agentAScore, agentBScore: j3.agentBScore },
    { judgeId: 'judge-4', agentAScore: j4.agentAScore, agentBScore: j4.agentBScore }
  ]

  const agg = await aggregateJudgeScores(judgeScores)
  const winnerAgentId = agg.a === agg.b ? undefined : agg.a > agg.b ? agentA.id : agentB.id

  const conclusion = await judgeConclusion(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'), agg.a, agg.b)
  const match = await db.createMatch({ topic, agentAId, agentBId, rounds: entries, judgeScores, winnerAgentId, judgeConclusion: conclusion })

  const ownerA = agentA.ownerAccountId
  const ownerB = agentB.ownerAccountId
  if (ownerA && ownerB) {
    const userA = await db.getUserByAccountId(ownerA)
    const userB = await db.getUserByAccountId(ownerB)
    const ratingA = (userA && typeof userA.elo_rating === 'number') ? userA.elo_rating : 1000
    const ratingB = (userB && typeof userB.elo_rating === 'number') ? userB.elo_rating : 1000
    const sa = winnerAgentId ? (winnerAgentId === agentA.id ? 1 : 0) : 0.5
    const sb = 1 - sa
    const elo = calculateElo(ratingA, ratingB, sa, sb)
    await db.updateUserElo(ownerA, elo.ra)
    await db.updateUserElo(ownerB, elo.rb)
  }

  res.json(match)
})

app.get('/matches/:id', async (req: Request, res: Response) => {
  const m = await db.getMatch(req.params.id)
  if (!m) return res.status(404).json({ error: 'Not found' })
  res.json(m)
})

app.get('/matches', async (req: Request, res: Response) => {
  const list = await db.listMatches()
  res.json(list)
})

const port = Number(process.env.PORT || 4000)
app.listen(port, () => {})
app.post('/arenas', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ topic: z.string(), creatorAccountId: z.string(), gameType: z.enum(['import','challenge']).optional(), challengeMinutes: z.number().int().min(1).max(60).optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const arena = await db.createArena({ code, topic: parsed.data.topic, creatorAccountId: parsed.data.creatorAccountId, gameType: parsed.data.gameType || 'import', challengeMinutes: parsed.data.challengeMinutes })
    res.json(arena)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/tokens/mint-cok', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ accountId: z.string(), tinyAmount: z.number().int().positive().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const network = (process.env.HEDERA_NETWORK || process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet').toLowerCase()
    const tokenIdStr = process.env.COK_TOKEN_ID || '0.0.7284519'
    const treasuryIdStr = process.env.COK_TREASURY_ACCOUNT_ID
    const treasuryKeyStr = process.env.COK_TREASURY_PRIVATE_KEY
    const supplyKeyStr = process.env.COK_SUPPLY_PRIVATE_KEY || treasuryKeyStr
    if (!treasuryIdStr || !treasuryKeyStr) return res.status(500).json({ error: 'Server not configured for minting' })
    const tinyAmountEnv = Number(process.env.COK_MINT_TINY_AMOUNT || '0')
    const tinyAmount = parsed.data.tinyAmount && parsed.data.tinyAmount > 0 ? parsed.data.tinyAmount : (tinyAmountEnv > 0 ? tinyAmountEnv : 0)
    if (!tinyAmount) return res.status(400).json({ error: 'Missing mint amount (tiny units)' })

    const sdk = await import('@hashgraph/sdk')
    const { Client, AccountId, PrivateKey, TokenId, TransferTransaction, TokenMintTransaction } = sdk as any
    const client = Client.forTestnet()
    const treasuryId = AccountId.fromString(treasuryIdStr)
    const treSrc = String(treasuryKeyStr || '')
    const treasuryKey = PrivateKey.fromStringECDSA(treSrc)
    const supplyKeySrc = String(supplyKeyStr || '')
    const derHex = supplyKeySrc.startsWith('0x') ? supplyKeySrc.slice(2) : supplyKeySrc
    const supplyKey = PrivateKey.fromStringDer(derHex)
    client.setOperator(treasuryId, treasuryKey)
    const tokenId = TokenId.fromString(tokenIdStr)

    const txMint = await new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(tinyAmount)
      .freezeWith(client)
      .sign(supplyKey)
    const submitMint = await txMint.execute(client)
    const receiptMint = await submitMint.getReceipt(client)
    if (String(receiptMint.status) !== 'SUCCESS') {
      return res.status(500).json({ error: `Mint failed: ${String(receiptMint.status)}` })
    }

    const tx = new TransferTransaction()
      .addTokenTransfer(tokenId, treasuryId, -tinyAmount)
      .addTokenTransfer(tokenId, AccountId.fromString(parsed.data.accountId), tinyAmount)
    const submit = await tx.execute(client)
    const receipt = await submit.getReceipt(client)
    return res.json({ status: String(receipt.status), transactionId: submit.transactionId.toString(), mintStatus: String(receiptMint.status), mintTransactionId: submitMint.transactionId.toString() })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/arenas/:id', async (req: Request, res: Response) => {
  try {
    const a = await db.getArenaById(req.params.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    res.json(a)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/arenas/code/:code', async (req: Request, res: Response) => {
  try {
    const found = await db.getArenaByCode(String(req.params.code || '').toUpperCase())
    if (!found) return res.status(404).json({ error: 'Not found' })
    res.json(found)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/arenas', async (req: Request, res: Response) => {
  try {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined
    const list = await db.listArenas(accountId)
    res.json(list)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/arenas/watchers', async (req: Request, res: Response) => {
  try {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' })
    const list = await db.listWatchArenas(accountId)
    res.json(list)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/join', async (req: Request, res: Response) => {
  try {
    const byIdSchema = z.object({ id: z.string(), joinerAccountId: z.string() })
    const byCodeSchema = z.object({ code: z.string(), joinerAccountId: z.string() })
    const body: any = req.body || {}
    let a: any | undefined
    let id: string | undefined
    if (byIdSchema.safeParse(body).success) {
      id = body.id
      a = await db.getArenaById(body.id)
    } else if (byCodeSchema.safeParse(body).success) {
      const found = await db.getArenaByCode(body.code)
      a = found
      id = found?.id
    } else {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.joiner_account_id) return res.status(400).json({ error: 'Already joined' })
    const u = await db.updateArenaById(id as string, { joiner_account_id: body.joinerAccountId })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/watch', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string(), accountId: z.string() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const a = await db.getArenaById(parsed.data.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    const watchers: string[] = Array.isArray(a.watcher_account_ids) ? a.watcher_account_ids : []
    if (!watchers.includes(parsed.data.accountId)) watchers.push(parsed.data.accountId)
    const u = await db.updateArenaById(parsed.data.id, { watcher_account_ids: watchers })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.delete('/arenas/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : (typeof req.query.accountId === 'string' ? req.query.accountId : undefined)
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' })
    const a = await db.getArenaById(id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.creator_account_id !== accountId) return res.status(403).json({ error: 'Forbidden' })
    if (a.status === 'completed') return res.status(400).json({ error: 'Cannot delete completed arena' })
    await db.deleteArenaById(id)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/select', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string(), side: z.enum(['pros','cons']), agentId: z.string() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const field = parsed.data.side === 'pros' ? 'agent_a_id' : 'agent_b_id'
    const u = await db.updateArenaById(parsed.data.id, { [field]: parsed.data.agentId })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/ready', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string(), side: z.enum(['creator','joiner']), ready: z.boolean() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const a = await db.getArenaById(parsed.data.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.status === 'completed') return res.status(400).json({ error: 'Arena completed' })
    const field = parsed.data.side === 'creator' ? 'creator_ready' : 'joiner_ready'
    const u = await db.updateArenaById(parsed.data.id, { [field]: parsed.data.ready })
    let out = u
    if (u && u.creator_ready && u.joiner_ready && u.status !== 'select_agent' && u.status !== 'challenge') {
      const needSides = !u.creator_side || !u.joiner_side
      if (needSides) {
        const rnd = Math.random() < 0.5
        const creator_side = rnd ? 'pros' : 'cons'
        const joiner_side = rnd ? 'cons' : 'pros'
        const nextStatus = (u.game_type === 'challenge') ? 'challenge' : 'select_agent'
        out = await db.updateArenaById(parsed.data.id, { creator_side, joiner_side, status: nextStatus })
      } else {
        const nextStatus = (u.game_type === 'challenge') ? 'challenge' : 'select_agent'
        out = await db.updateArenaById(parsed.data.id, { status: nextStatus })
      }
    }
    res.json(out)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/submit-knowledge', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string(), side: z.enum(['pros','cons']), accountId: z.string(), agentName: z.string().min(2), content: z.string().min(1) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const a = await db.getArenaById(parsed.data.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.game_type !== 'challenge' || a.status !== 'challenge') return res.status(400).json({ error: 'Not in challenge mode' })
    if (!a.challenge_minutes) return res.status(400).json({ error: 'Challenge not configured' })
    const isPros = parsed.data.side === 'pros'
    const startedAt = isPros ? a.creator_writing_started_at : a.joiner_writing_started_at
    if (!startedAt) return res.status(400).json({ error: 'Not started' })
    const pausedSecs = isPros ? (a.creator_paused_secs || 0) : (a.joiner_paused_secs || 0)
    const writingStatus = parsed.data.side === 'pros' ? a.creator_writing_status : a.joiner_writing_status
    const pausedAt = isPros ? a.creator_paused_at : a.joiner_paused_at
    const nowTs = (writingStatus === 'paused' && pausedAt) ? new Date(pausedAt).getTime() : Date.now()
    const elapsedSecs = Math.floor((nowTs - new Date(startedAt).getTime()) / 1000) - pausedSecs
    if (elapsedSecs > a.challenge_minutes * 60) return res.status(400).json({ error: 'Time over' })
    if (!(writingStatus === 'writing' || writingStatus === 'paused')) return res.status(400).json({ error: 'Must be writing or paused to submit' })
    const field = parsed.data.side === 'pros' ? 'agent_a_id' : 'agent_b_id'
    if (a[field]) return res.status(400).json({ error: 'Agent already set' })
    const title = `Arena ${a.id} ${parsed.data.side} knowledge`
    const owningAccount = parsed.data.accountId
    const kp = await db.createKnowledgePack(title, parsed.data.content, owningAccount)
    const ag = await db.createAgent(parsed.data.agentName, kp.id, owningAccount, 'challenge')
    const submittedField = parsed.data.side === 'pros' ? 'creator_knowledge_submitted' : 'joiner_knowledge_submitted'
    const statusField = parsed.data.side === 'pros' ? 'creator_writing_status' : 'joiner_writing_status'
    const pausedAtField = parsed.data.side === 'pros' ? 'creator_paused_at' : 'joiner_paused_at'
    const draftTextField = parsed.data.side === 'pros' ? 'creator_draft_text' : 'joiner_draft_text'
    const draftNameField = parsed.data.side === 'pros' ? 'creator_draft_agent_name' : 'joiner_draft_agent_name'
    const u = await db.updateArenaById(parsed.data.id, { [field]: ag.id, [submittedField]: true, [statusField]: 'finished', [pausedAtField]: null, [draftTextField]: null, [draftNameField]: null })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/cancel', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string(), reason: z.string().max(200).optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const a = await db.getArenaById(parsed.data.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.status === 'completed') return res.status(400).json({ error: 'Arena completed' })
    let u = await db.updateArenaById(parsed.data.id, parsed.data.reason ? { status: 'cancelled', cancel_reason: parsed.data.reason } : { status: 'cancelled' })
    if (!u && parsed.data.reason) {
      u = await db.updateArenaById(parsed.data.id, { status: 'cancelled' })
      if (u) u.cancel_reason = parsed.data.reason
    }
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/challenge-control', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string(), accountId: z.string(), action: z.enum(['start','pause','resume','finish']) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const a = await db.getArenaById(parsed.data.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.game_type !== 'challenge' || a.status !== 'challenge') return res.status(400).json({ error: 'Not in challenge mode' })
    const isCreator = a.creator_account_id === parsed.data.accountId
    const isJoiner = a.joiner_account_id === parsed.data.accountId
    if (!isCreator && !isJoiner) return res.status(403).json({ error: 'Forbidden' })
    const prefix = isCreator ? 'creator' : 'joiner'
    let values: any = {}
    if (parsed.data.action === 'start') {
      values[`${prefix}_writing_status`] = 'writing'
      values[`${prefix}_writing_started_at`] = new Date().toISOString()
      values[`${prefix}_paused_secs`] = 0
      values[`${prefix}_paused_at`] = null
    } else if (parsed.data.action === 'pause') {
      values[`${prefix}_writing_status`] = 'paused'
      values[`${prefix}_paused_at`] = new Date().toISOString()
    } else if (parsed.data.action === 'resume') {
      values[`${prefix}_writing_status`] = 'writing'
      const pausedAt = a[`${prefix}_paused_at`]
      if (pausedAt) {
        const delta = Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000)
        values[`${prefix}_paused_secs`] = (a[`${prefix}_paused_secs`] || 0) + Math.max(0, delta)
      }
      values[`${prefix}_paused_at`] = null
    } else if (parsed.data.action === 'finish') {
      values[`${prefix}_writing_status`] = 'finished'
      const pausedAt = a[`${prefix}_paused_at`]
      if (pausedAt) {
        const delta = Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000)
        values[`${prefix}_paused_secs`] = (a[`${prefix}_paused_secs`] || 0) + Math.max(0, delta)
      }
      values[`${prefix}_paused_at`] = null
    }
    const u = await db.updateArenaById(parsed.data.id, values)
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/save-draft', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string(), accountId: z.string(), agentName: z.string().optional(), content: z.string().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const a = await db.getArenaById(parsed.data.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.game_type !== 'challenge' || a.status !== 'challenge') return res.status(400).json({ error: 'Not in challenge mode' })
    const isCreator = a.creator_account_id === parsed.data.accountId
    const isJoiner = a.joiner_account_id === parsed.data.accountId
    if (!isCreator && !isJoiner) return res.status(403).json({ error: 'Forbidden' })
    const status = isCreator ? a.creator_writing_status : a.joiner_writing_status
    if (!(status === 'writing' || status === 'paused')) return res.status(400).json({ error: 'Not allowed' })
    const textField = isCreator ? 'creator_draft_text' : 'joiner_draft_text'
    const nameField = isCreator ? 'creator_draft_agent_name' : 'joiner_draft_agent_name'
    const updates: any = {}
    if (typeof parsed.data.content === 'string') updates[textField] = parsed.data.content
    if (typeof parsed.data.agentName === 'string') updates[nameField] = parsed.data.agentName
    const u = await db.updateArenaById(parsed.data.id, updates)
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/arenas/start', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ id: z.string() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const a = await db.getArenaById(parsed.data.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
    if (a.status === 'matching') return res.status(400).json({ error: 'Already generating' })
    if (a.status === 'completed' || a.match_id) return res.status(400).json({ error: 'Debate completed' })
  if (!a.agent_a_id || !a.agent_b_id) return res.status(400).json({ error: 'Agents not selected' })
  if (a.game_type !== 'challenge' && (!a.creator_ready || !a.joiner_ready)) return res.status(400).json({ error: 'Both players must be ready' })
    await db.updateArenaById(parsed.data.id, { status: 'matching' })
    const kpA = await db.getAgent(a.agent_a_id)
    const kpB = await db.getAgent(a.agent_b_id)
    if (!kpA || !kpB) return res.status(404).json({ error: 'Agent not found' })
    const rounds: RoundName[] = ['opening', 'direct_arguments', 'rebuttals', 'counter_rebuttals', 'question_crossfire', 'answer_crossfire', 'final_arguments']
    const entries: RoundEntry[] = []
    for (const r of rounds) {
      const sysA = systemPrompt(kpA.name, r)
      const sysB = systemPrompt(kpB.name, r)
      const prevA = entries.filter(e => e.agentId === kpA.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const prevB = entries.filter(e => e.agentId === kpB.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const kpATexts: string[] = []
      const kpBTexts: string[] = []
      for (const id of (kpA.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpATexts.push(k.content) }
      for (const id of (kpB.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpBTexts.push(k.content) }
      const aggA = kpATexts.join('\n\n---\n')
      const aggB = kpBTexts.join('\n\n---\n')
      const promptA = `Topic: ${a.topic}\nKnowledge:\n${aggA}\nOpponent said:\n${prevB}`
      const promptB = `Topic: ${a.topic}\nKnowledge:\n${aggB}\nOpponent said:\n${prevA}`
      const aText = await generateText(sysA, promptA)
      const bText = await generateText(sysB, promptB)
      entries.push({ round: r, agentId: kpA.id, text: aText })
      entries.push({ round: r, agentId: kpB.id, text: bText })
    }
    const aAll = entries.filter(e => e.agentId === kpA.id).map(e => e.text).join('\n')
    const bAll = entries.filter(e => e.agentId === kpB.id).map(e => e.text).join('\n')
    const j1 = await judgeDebate(a.topic, aAll, bAll)
    const j2 = await judgeDebate(a.topic, aAll, bAll)
    const j3 = await judgeDebate(a.topic, aAll, bAll)
    const j4 = await judgeDebate(a.topic, aAll, bAll)
    const judgeScores = [
      { judgeId: 'judge-1', agentAScore: j1.agentAScore, agentBScore: j1.agentBScore },
      { judgeId: 'judge-2', agentAScore: j2.agentAScore, agentBScore: j2.agentBScore },
      { judgeId: 'judge-3', agentAScore: j3.agentAScore, agentBScore: j3.agentBScore },
      { judgeId: 'judge-4', agentAScore: j4.agentAScore, agentBScore: j4.agentBScore }
    ]
    const agg = await aggregateJudgeScores(judgeScores)
    const winnerAgentId = agg.a === agg.b ? undefined : (agg.a > agg.b ? kpA.id : kpB.id)
    const conclusion = await judgeConclusion(a.topic, aAll, bAll, agg.a, agg.b)
    const match = await db.createMatch({ topic: a.topic, agentAId: kpA.id, agentBId: kpB.id, rounds: entries, judgeScores, winnerAgentId, judgeConclusion: conclusion })
    await db.updateArenaById(parsed.data.id, { match_id: match.id, status: 'completed' })
    const ownerA = kpA.ownerAccountId
    const ownerB = kpB.ownerAccountId
    if (ownerA && ownerB) {
      const userA = await db.getUserByAccountId(ownerA)
      const userB = await db.getUserByAccountId(ownerB)
      const ratingA = (userA && typeof userA.elo_rating === 'number') ? userA.elo_rating : 1000
      const ratingB = (userB && typeof userB.elo_rating === 'number') ? userB.elo_rating : 1000
      const sa = winnerAgentId ? (winnerAgentId === kpA.id ? 1 : 0) : 0.5
      const sb = 1 - sa
      const elo = calculateElo(ratingA, ratingB, sa, sb)
      await db.updateUserElo(ownerA, elo.ra)
      await db.updateUserElo(ownerB, elo.rb)
    }
    res.json({ arena: await db.getArenaById(parsed.data.id), match })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const list = await db.listLeaderboardAccounts()
    res.json(list)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.post('/users/name', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ accountId: z.string(), name: z.string().min(1).max(120) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const u = await db.upsertUserName(parsed.data.accountId, parsed.data.name)
    if (!u) return res.status(500).json({ error: 'Update failed' })
    res.json(u)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' })
  }
})

app.get('/arenas/:id/stream', async (req: Request, res: Response) => {
  try {
    const arenaId = req.params.id
    const a = await db.getArenaById(arenaId)
    if (!a) return res.status(404).end()
    if (!a.agent_a_id || !a.agent_b_id) return res.status(400).end()
    if (!a.creator_ready || !a.joiner_ready) return res.status(400).end()

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let closed = false
    req.on('close', () => { closed = true })

    function send(event: string, data: any) {
      if (closed) return
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const rounds: RoundName[] = ['opening', 'direct_arguments', 'rebuttals', 'counter_rebuttals', 'question_crossfire', 'answer_crossfire', 'final_arguments']

    if (a.match_id) {
      const match = await db.getMatch(a.match_id)
      if (!match) return res.status(404).end()
      for (const r of rounds) {
        send('round', { round: r })
        const pros = match.rounds.find((x: any) => x.round === r && x.agentId === match.agentAId)?.text || ''
        const cons = match.rounds.find((x: any) => x.round === r && x.agentId === match.agentBId)?.text || ''
        for (const chunk of chunkText(pros)) { send('token', { side: 'pros', text: chunk }); await sleep(60) }
        for (const chunk of chunkText(cons)) { send('token', { side: 'cons', text: chunk }); await sleep(60) }
      }
      const agg = await aggregateJudgeScores(match.judgeScores)
      send('scores', { judgeScores: match.judgeScores, aggregate: agg, winnerAgentId: match.winnerAgentId })
      send('completed', { matchId: match.id })
      return res.end()
    }

    if (generating.has(arenaId)) {
      send('info', { status: 'already_generating' })
      return res.end()
    }

    generating.add(arenaId)
    await db.updateArenaById(arenaId, { status: 'matching' })
    const kpA = await db.getAgent(a.agent_a_id)
    const kpB = await db.getAgent(a.agent_b_id)
    if (!kpA || !kpB) { generating.delete(arenaId); return res.status(404).end() }

    const entries: RoundEntry[] = []
    for (const r of rounds) {
      send('round', { round: r })
      const sysA = systemPrompt(kpA.name, r)
      const sysB = systemPrompt(kpB.name, r)
      const prevA = entries.filter(e => e.agentId === kpA.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const prevB = entries.filter(e => e.agentId === kpB.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const kpATexts: string[] = []
      const kpBTexts: string[] = []
      for (const id of (kpA.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpATexts.push(k.content) }
      for (const id of (kpB.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpBTexts.push(k.content) }
      const aggA = kpATexts.join('\n\n---\n')
      const aggB = kpBTexts.join('\n\n---\n')
      const promptA = `Topic: ${a.topic}\nKnowledge:\n${aggA}\nOpponent said:\n${prevB}`
      const promptB = `Topic: ${a.topic}\nKnowledge:\n${aggB}\nOpponent said:\n${prevA}`
      const aTextFull = await generateText(sysA, promptA)
      const bTextFull = await generateText(sysB, promptB)
      for (const chunk of chunkText(aTextFull)) { send('token', { side: 'pros', text: chunk }); await sleep(60) }
      entries.push({ round: r, agentId: kpA.id, text: aTextFull })
      for (const chunk of chunkText(bTextFull)) { send('token', { side: 'cons', text: chunk }); await sleep(60) }
      entries.push({ round: r, agentId: kpB.id, text: bTextFull })
    }
    const aAll = entries.filter(e => e.agentId === kpA.id).map(e => e.text).join('\n')
    const bAll = entries.filter(e => e.agentId === kpB.id).map(e => e.text).join('\n')
    const j1 = await judgeDebate(a.topic, aAll, bAll)
    const j2 = await judgeDebate(a.topic, aAll, bAll)
    const j3 = await judgeDebate(a.topic, aAll, bAll)
    const j4 = await judgeDebate(a.topic, aAll, bAll)
    const judgeScores = [
      { judgeId: 'judge-1', agentAScore: j1.agentAScore, agentBScore: j1.agentBScore },
      { judgeId: 'judge-2', agentAScore: j2.agentAScore, agentBScore: j2.agentBScore },
      { judgeId: 'judge-3', agentAScore: j3.agentAScore, agentBScore: j3.agentBScore },
      { judgeId: 'judge-4', agentAScore: j4.agentAScore, agentBScore: j4.agentBScore }
    ]
    const agg = await aggregateJudgeScores(judgeScores)
    const winnerAgentId = agg.a === agg.b ? undefined : (agg.a > agg.b ? kpA.id : kpB.id)
    const match = await db.createMatch({ topic: a.topic, agentAId: kpA.id, agentBId: kpB.id, rounds: entries, judgeScores, winnerAgentId })
    await db.updateArenaById(arenaId, { match_id: match.id, status: 'completed' })
    const ownerA = kpA.ownerAccountId
    const ownerB = kpB.ownerAccountId
    if (ownerA && ownerB) {
      const userA = await db.getUserByAccountId(ownerA)
      const userB = await db.getUserByAccountId(ownerB)
      const ratingA = (userA && typeof userA.elo_rating === 'number') ? userA.elo_rating : 1000
      const ratingB = (userB && typeof userB.elo_rating === 'number') ? userB.elo_rating : 1000
      const sa = winnerAgentId ? (winnerAgentId === kpA.id ? 1 : 0) : 0.5
      const sb = 1 - sa
      const elo = calculateElo(ratingA, ratingB, sa, sb)
      await db.updateUserElo(ownerA, elo.ra)
      await db.updateUserElo(ownerB, elo.rb)
    }
    generating.delete(arenaId)
    send('scores', { judgeScores, aggregate: agg, winnerAgentId })
    send('completed', { matchId: match.id })
    res.end()
  } catch (e: any) {
    try {
      res.status(500).end()
    } catch {}
  }
})

function chunkText(t: string) {
  const chunks: string[] = []
  let i = 0
  const size = 30
  while (i < t.length) {
    chunks.push(t.slice(i, i + size))
    i += size
  }
  return chunks.length ? chunks : ['']
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
