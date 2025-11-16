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

app.get('/health', (req: Request, res: Response) => {
  res.json({ ok: true, supabase: persistenceInfo.useSupabase })
})

app.post('/knowledge-packs', async (req: Request, res: Response) => {
  const schema = z.object({ title: z.string(), content: z.string() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const kp = await db.createKnowledgePack(parsed.data.title, parsed.data.content)
  res.json(kp)
})

app.get('/knowledge-packs', async (req: Request, res: Response) => {
  const list = await db.listKnowledgePacks()
  res.json(list)
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
  const list = await db.listAgents()
  res.json(list)
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

  const rounds: RoundName[] = ['opening', 'rebuttal', 'crossfire', 'closing']
  const entries: RoundEntry[] = []

  function sys(name: string, r: RoundName) {
    if (r === 'opening') return `You are ${name}. Use only the provided knowledge. Produce a concise opening that frames the thesis and strongest points strictly from the knowledge. If absolutely no usable content exists, reply "unknown".`
    if (r === 'rebuttal') return `You are ${name}. Use only the provided knowledge. Produce a focused rebuttal that directly addresses the opponent's claims using evidence from the knowledge. Be specific and avoid generic statements.`
    if (r === 'crossfire') return `You are ${name}. Use only the provided knowledge. Produce a crossfire-style exchange: challenge the opponent with 2–3 short questions or points and provide compact follow-ups that expose weaknesses based on what the opponent said. Keep it crisp and refer to the knowledge.`
    return `You are ${name}. Use only the provided knowledge. Produce a clear closing that summarizes your strongest arguments and gives a definitive conclusion aligned with the knowledge. Avoid introducing new points not grounded in the knowledge.`
  }

  for (const r of rounds) {
    const prevA = entries.filter(e => e.agentId === agentA.id).map(e => `${e.round}: ${e.text}`).join('\n')
    const prevB = entries.filter(e => e.agentId === agentB.id).map(e => `${e.round}: ${e.text}`).join('\n')
    const promptA = `Round: ${r}\nTopic: ${topic}\nKnowledge:\n${aggA}\nOpponent said:\n${prevB}`
    const promptB = `Round: ${r}\nTopic: ${topic}\nKnowledge:\n${aggB}\nOpponent said:\n${prevA}`
    const aText = await generateText(sys(agentA.name, r), promptA)
    const bText = await generateText(sys(agentB.name, r), promptB)
    entries.push({ round: r, agentId: agentA.id, text: aText })
    entries.push({ round: r, agentId: agentB.id, text: bText })
  }

  const j1 = await judgeDebate(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'))
  const j2 = await judgeDebate(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'))
  const j3 = await judgeDebate(topic, entries.filter(e => e.agentId === agentA.id).map(e => e.text).join('\n'), entries.filter(e => e.agentId === agentB.id).map(e => e.text).join('\n'))

  const judgeScores = [
    { judgeId: 'judge-1', agentAScore: j1.agentAScore, agentBScore: j1.agentBScore },
    { judgeId: 'judge-2', agentAScore: j2.agentAScore, agentBScore: j2.agentBScore },
    { judgeId: 'judge-3', agentAScore: j3.agentAScore, agentBScore: j3.agentBScore }
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

app.get('/arenas/:id', async (req: Request, res: Response) => {
  try {
    const a = await db.getArenaById(req.params.id)
    if (!a) return res.status(404).json({ error: 'Not found' })
    res.json(a)
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
    const kp = await db.createKnowledgePack(title, parsed.data.content)
    const owningAccount = parsed.data.accountId
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
    const rounds: RoundName[] = ['opening', 'rebuttal', 'crossfire', 'closing']
    const entries: RoundEntry[] = []
    for (const r of rounds) {
      const sysA = `You are ${kpA.name}. Use only the provided knowledge. Do not use any external information. When the round is opening, produce a concise opening derived strictly from the provided knowledge. If absolutely no usable content exists, reply "unknown". Do not reply "unknown" if general points exist in knowledge.`
      const sysB = `You are ${kpB.name}. Use only the provided knowledge. Do not use any external information. When the round is opening, produce a concise opening derived strictly from the provided knowledge. If absolutely no usable content exists, reply "unknown". Do not reply "unknown" if general points exist in knowledge.`
      const prevA = entries.filter(e => e.agentId === kpA.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const prevB = entries.filter(e => e.agentId === kpB.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const kpATexts: string[] = []
      const kpBTexts: string[] = []
      for (const id of (kpA.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpATexts.push(k.content) }
      for (const id of (kpB.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpBTexts.push(k.content) }
      const aggA = kpATexts.join('\n\n---\n')
      const aggB = kpBTexts.join('\n\n---\n')
      const promptA = `Round: ${r}\nTopic: ${a.topic}\nKnowledge:\n${aggA}\nOpponent said:\n${prevB}`
      const promptB = `Round: ${r}\nTopic: ${a.topic}\nKnowledge:\n${aggB}\nOpponent said:\n${prevA}`
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
    const judgeScores = [
      { judgeId: 'judge-1', agentAScore: j1.agentAScore, agentBScore: j1.agentBScore },
      { judgeId: 'judge-2', agentAScore: j2.agentAScore, agentBScore: j2.agentBScore },
      { judgeId: 'judge-3', agentAScore: j3.agentAScore, agentBScore: j3.agentBScore }
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

    const rounds: RoundName[] = ['opening', 'rebuttal', 'crossfire', 'closing']

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
      const sysA = `You are ${kpA.name}. Use only the provided knowledge. Do not use any external information. When the round is opening, produce a concise opening derived strictly from the provided knowledge. If absolutely no usable content exists, reply "unknown". Do not reply "unknown" if general points exist in knowledge.`
      const sysB = `You are ${kpB.name}. Use only the provided knowledge. Do not use any external information. When the round is opening, produce a concise opening derived strictly from the provided knowledge. If absolutely no usable content exists, reply "unknown". Do not reply "unknown" if general points exist in knowledge.`
      const prevA = entries.filter(e => e.agentId === kpA.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const prevB = entries.filter(e => e.agentId === kpB.id).map(e => `${e.round}: ${e.text}`).join('\n')
      const kpATexts: string[] = []
      const kpBTexts: string[] = []
      for (const id of (kpA.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpATexts.push(k.content) }
      for (const id of (kpB.knowledgePackIds || [])) { const k = await db.getKnowledgePack(id); if (k) kpBTexts.push(k.content) }
      const aggA = kpATexts.join('\n\n---\n')
      const aggB = kpBTexts.join('\n\n---\n')
      const promptA = `Round: ${r}\nTopic: ${a.topic}\nKnowledge:\n${aggA}\nOpponent said:\n${prevB}`
      const promptB = `Round: ${r}\nTopic: ${a.topic}\nKnowledge:\n${aggB}\nOpponent said:\n${prevA}`
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
    const judgeScores = [
      { judgeId: 'judge-1', agentAScore: j1.agentAScore, agentBScore: j1.agentBScore },
      { judgeId: 'judge-2', agentAScore: j2.agentAScore, agentBScore: j2.agentBScore },
      { judgeId: 'judge-3', agentAScore: j3.agentAScore, agentBScore: j3.agentBScore }
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
