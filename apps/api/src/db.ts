import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env')
]
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p })
    break
  }
}
import { KnowledgePack, Agent, Match, UUID } from './types'
import { createClient } from '@supabase/supabase-js'

const useSupabase = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = useSupabase
  ? createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string)
  : null

const memory = {
  knowledge: new Map<UUID, KnowledgePack>(),
  agents: new Map<UUID, Agent>(),
  matches: new Map<UUID, Match>(),
  arenas: new Map<string, any>()
}

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const db = {
  createKnowledgePack: async (title: string, content: string): Promise<KnowledgePack> => {
    if (supabase) {
      const { data, error } = await supabase.from('knowledge_packs').insert({ title, content }).select().single()
      if (error) throw error
      return { id: data.id, title: data.title, content: data.content, createdAt: new Date(data.created_at).getTime() }
    }
    const kp: KnowledgePack = { id: id(), title, content, createdAt: Date.now() }
    memory.knowledge.set(kp.id, kp)
    return kp
  },
  getKnowledgePack: async (kpId: UUID): Promise<KnowledgePack | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('knowledge_packs').select('*').eq('id', kpId).single()
      if (error) return undefined
      return { id: data.id, title: data.title, content: data.content, createdAt: new Date(data.created_at).getTime() }
    }
    return memory.knowledge.get(kpId)
  },
  listKnowledgePacks: async (): Promise<KnowledgePack[]> => {
    if (supabase) {
      const { data, error } = await supabase.from('knowledge_packs').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data.map((d: any) => ({ id: d.id, title: d.title, content: d.content, createdAt: new Date(d.created_at).getTime() }))
    }
    return [...memory.knowledge.values()]
  },
  updateKnowledgePack: async (kpId: UUID, values: Partial<{ title: string; content: string }>): Promise<KnowledgePack | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('knowledge_packs').update(values as any).eq('id', kpId).select().single()
      if (error) return undefined
      return { id: data.id, title: data.title, content: data.content, createdAt: new Date(data.created_at).getTime() }
    }
    const existing = memory.knowledge.get(kpId)
    if (!existing) return undefined
    const updated: KnowledgePack = { ...existing, ...values }
    memory.knowledge.set(kpId, updated)
    return updated
  },
  createAgent: async (name: string, knowledgePackId: UUID, ownerAccountId?: string, specialization?: string): Promise<Agent> => {
    if (supabase) {
      const { data, error } = await supabase.from('agents').insert({ name, knowledge_pack_id: knowledgePackId, owner_account_id: ownerAccountId || null, specialization: specialization || null }).select().single()
      if (!error) {
        await supabase.from('agent_knowledge_packs').insert({ agent_id: data.id, knowledge_pack_id: knowledgePackId })
        return { id: data.id, name: data.name, knowledgePackIds: [knowledgePackId], ownerAccountId: data.owner_account_id || undefined, specialization: data.specialization || undefined, createdAt: new Date(data.created_at).getTime() }
      }
      const msg = (error as any)?.message || ''
      if (msg.includes('column') && (msg.includes('owner_account_id') || msg.includes('specialization')) && msg.includes('does not exist')) {
        const r = await supabase.from('agents').insert({ name, knowledge_pack_id: knowledgePackId }).select().single()
        if (r.error) throw r.error
        const d = r.data
        await supabase.from('agent_knowledge_packs').insert({ agent_id: d.id, knowledge_pack_id: knowledgePackId })
        return { id: d.id, name: d.name, knowledgePackIds: [knowledgePackId], ownerAccountId: undefined, specialization: undefined, createdAt: new Date(d.created_at).getTime() }
      }
      throw error
    }
    const ag: Agent = { id: id(), name, knowledgePackIds: [knowledgePackId], ownerAccountId, specialization, createdAt: Date.now() }
    memory.agents.set(ag.id, ag)
    return ag
  },
  getAgent: async (agentId: UUID): Promise<Agent | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('agents').select('*').eq('id', agentId).single()
      if (error) return undefined
      const { data: joins } = await supabase.from('agent_knowledge_packs').select('knowledge_pack_id').eq('agent_id', agentId)
      const kpIds = (joins || []).map((row: any) => row.knowledge_pack_id)
      const uniq = Array.from(new Set(kpIds.length ? kpIds : [data.knowledge_pack_id].filter(Boolean)))
      return { id: data.id, name: data.name, knowledgePackIds: uniq, ownerAccountId: data.owner_account_id || undefined, specialization: data.specialization || undefined, createdAt: new Date(data.created_at).getTime() }
    }
    return memory.agents.get(agentId)
  },
  listAgents: async (): Promise<Agent[]> => {
    if (supabase) {
      const { data, error } = await supabase.from('agents').select('*').order('created_at', { ascending: false })
      if (error) throw error
      const { data: joins } = await supabase.from('agent_knowledge_packs').select('agent_id,knowledge_pack_id')
      const map = new Map<string, string[]>()
      for (const row of (joins || [])) {
        const arr = map.get(row.agent_id) || []
        arr.push(row.knowledge_pack_id)
        map.set(row.agent_id, arr)
      }
      return (data || []).map((d: any) => ({ id: d.id, name: d.name, knowledgePackIds: Array.from(new Set((map.get(d.id) || [d.knowledge_pack_id]).filter(Boolean))), ownerAccountId: d.owner_account_id || undefined, specialization: d.specialization || undefined, createdAt: new Date(d.created_at).getTime() }))
    }
    return [...memory.agents.values()]
  },
  updateAgent: async (agentId: UUID, values: Partial<{ name: string; specialization?: string }>): Promise<Agent | undefined> => {
    if (supabase) {
      const payload: any = {}
      if (typeof values.name === 'string') payload.name = values.name
      if (typeof values.specialization === 'string') payload.specialization = values.specialization
      const { data, error } = await supabase.from('agents').update(payload).eq('id', agentId).select().single()
      if (error) return undefined
      const { data: joins } = await supabase.from('agent_knowledge_packs').select('knowledge_pack_id').eq('agent_id', agentId)
      const kpIds = (joins || []).map((row: any) => row.knowledge_pack_id)
      const uniq = Array.from(new Set(kpIds.length ? kpIds : [data.knowledge_pack_id].filter(Boolean)))
      return { id: data.id, name: data.name, knowledgePackIds: uniq, ownerAccountId: data.owner_account_id || undefined, specialization: data.specialization || undefined, createdAt: new Date(data.created_at).getTime() }
    }
    const existing = memory.agents.get(agentId)
    if (!existing) return undefined
    const updated: Agent = { ...existing, ...values }
    memory.agents.set(agentId, updated)
    return updated
  },
  addAgentKnowledge: async (agentId: UUID, knowledgePackId: UUID): Promise<Agent | undefined> => {
    if (supabase) {
      await supabase.from('agent_knowledge_packs').insert({ agent_id: agentId, knowledge_pack_id: knowledgePackId })
      return await db.getAgent(agentId)
    }
    const existing = memory.agents.get(agentId)
    if (!existing) return undefined
    const set = new Set(existing.knowledgePackIds)
    set.add(knowledgePackId)
    const updated: Agent = { ...existing, knowledgePackIds: Array.from(set) }
    memory.agents.set(agentId, updated)
    return updated
  },
  removeAgentKnowledge: async (agentId: UUID, knowledgePackId: UUID): Promise<Agent | undefined> => {
    if (supabase) {
      await supabase.from('agent_knowledge_packs').delete().eq('agent_id', agentId).eq('knowledge_pack_id', knowledgePackId)
      return await db.getAgent(agentId)
    }
    const existing = memory.agents.get(agentId)
    if (!existing) return undefined
    const updated: Agent = { ...existing, knowledgePackIds: existing.knowledgePackIds.filter(k => k !== knowledgePackId) }
    memory.agents.set(agentId, updated)
    return updated
  },
  createMatch: async (m: Omit<Match, 'id' | 'createdAt'>): Promise<Match> => {
    if (supabase) {
      const payload = {
        topic: m.topic,
        agent_a_id: m.agentAId,
        agent_b_id: m.agentBId,
        rounds: m.rounds,
        judge_scores: m.judgeScores,
        winner_agent_id: m.winnerAgentId || null,
        judge_conclusion: m.judgeConclusion || null
      }
      const { data, error } = await supabase.from('matches').insert(payload).select().single()
      if (error) throw error
      return {
        id: data.id,
        topic: data.topic,
        agentAId: data.agent_a_id,
        agentBId: data.agent_b_id,
        rounds: data.rounds,
        judgeScores: data.judge_scores,
        winnerAgentId: data.winner_agent_id || undefined,
        judgeConclusion: data.judge_conclusion || undefined,
        createdAt: new Date(data.created_at).getTime()
      }
    }
    const match: Match = { id: id(), createdAt: Date.now(), ...m }
    memory.matches.set(match.id, match)
    return match
  },
  getMatch: async (matchId: UUID): Promise<Match | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).single()
      if (error) return undefined
      return {
        id: data.id,
        topic: data.topic,
        agentAId: data.agent_a_id,
        agentBId: data.agent_b_id,
        rounds: data.rounds,
        judgeScores: data.judge_scores,
        winnerAgentId: data.winner_agent_id || undefined,
        judgeConclusion: data.judge_conclusion || undefined,
        createdAt: new Date(data.created_at).getTime()
      }
    }
    return memory.matches.get(matchId)
  },
  listMatches: async (): Promise<Match[]> => {
    if (supabase) {
      const { data, error } = await supabase.from('matches').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data.map((d: any) => ({
        id: d.id,
        topic: d.topic,
        agentAId: d.agent_a_id,
        agentBId: d.agent_b_id,
        rounds: d.rounds,
        judgeScores: d.judge_scores,
        winnerAgentId: d.winner_agent_id || undefined,
        judgeConclusion: d.judge_conclusion || undefined,
        createdAt: new Date(d.created_at).getTime()
      }))
    }
    return [...memory.matches.values()].sort((a, b) => b.createdAt - a.createdAt)
  },
  updateMatch: async (matchId: UUID, updater: (m: Match) => Match): Promise<Match | undefined> => {
    if (supabase) {
      const existing = await db.getMatch(matchId)
      if (!existing) return undefined
      const updated = updater(existing)
      const payload = {
        topic: updated.topic,
        agent_a_id: updated.agentAId,
        agent_b_id: updated.agentBId,
        rounds: updated.rounds,
        judge_scores: updated.judgeScores,
        winner_agent_id: updated.winnerAgentId || null,
        judge_conclusion: updated.judgeConclusion || null
      }
      await supabase.from('matches').update(payload).eq('id', matchId)
      return updated
    }
    const m = memory.matches.get(matchId)
    if (!m) return undefined
    const u = updater(m)
    memory.matches.set(matchId, u)
    return u
  }
  , deleteAgent: async (agentId: UUID): Promise<boolean> => {
    if (supabase) {
      await supabase.from('arenas').update({ agent_a_id: null }).eq('agent_a_id', agentId)
      await supabase.from('arenas').update({ agent_b_id: null }).eq('agent_b_id', agentId)
      await supabase
        .from('matches')
        .delete()
        .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`)
      await supabase.from('matches').delete().eq('winner_agent_id', agentId)
      const { error } = await supabase.from('agents').delete().eq('id', agentId)
      if (error) throw error
      return true
    }
    const existed = memory.agents.has(agentId)
    memory.agents.delete(agentId)
    return existed
  }
  , deleteKnowledgePack: async (kpId: UUID): Promise<boolean> => {
    if (supabase) {
      const { data: joinRows } = await supabase.from('agent_knowledge_packs').select('agent_id').eq('knowledge_pack_id', kpId)
      const agentIds = (joinRows || []).map((r: any) => r.agent_id)
      if (agentIds.length) {
        await supabase.from('arenas').update({ agent_a_id: null }).in('agent_a_id', agentIds)
        await supabase.from('arenas').update({ agent_b_id: null }).in('agent_b_id', agentIds)
        await supabase.from('matches').delete().in('agent_a_id', agentIds)
        await supabase.from('matches').delete().in('agent_b_id', agentIds)
        await supabase.from('matches').delete().in('winner_agent_id', agentIds)
        await supabase.from('agents').delete().in('id', agentIds)
      }
      const { error } = await supabase.from('knowledge_packs').delete().eq('id', kpId)
      if (error) throw error
      return true
    }
    const existed = memory.knowledge.has(kpId)
    memory.knowledge.delete(kpId)
    for (const [aid, ag] of memory.agents.entries()) {
      const updated: Agent = { ...ag, knowledgePackIds: ag.knowledgePackIds.filter(k => k !== kpId) }
      memory.agents.set(aid, updated)
    }
    return existed
  }
  , createArena: async (arena: { code: string; topic: string; creatorAccountId: string; gameType?: 'import'|'challenge'; challengeMinutes?: number }): Promise<any> => {
    if (supabase) {
      let attempts = 0
      while (attempts < 5) {
        const code = attempts === 0 ? arena.code : Math.random().toString(36).slice(2, 8).toUpperCase()
        const payload: any = { code, topic: arena.topic, creator_account_id: arena.creatorAccountId }
        if (arena.gameType) payload.game_type = arena.gameType
        if (arena.challengeMinutes) payload.challenge_minutes = arena.challengeMinutes
        const { data, error } = await supabase.from('arenas').insert(payload).select().single()
        if (!error) return data
        const msg = (error as any)?.message || ''
        if (msg.includes('relation') && msg.includes('does not exist')) {
          const a = { id: id(), code, topic: arena.topic, status: 'waiting', creator_account_id: arena.creatorAccountId, created_at: new Date().toISOString(), game_type: arena.gameType || 'import', challenge_minutes: arena.challengeMinutes }
          memory.arenas.set(a.code, a)
          return a
        }
        if (msg.includes('duplicate key') || msg.includes('unique')) {
          attempts++
          continue
        }
        throw error
      }
      throw new Error('Failed to generate unique arena code after retries')
    }
    const a = { id: id(), code: arena.code, topic: arena.topic, status: 'waiting', creator_account_id: arena.creatorAccountId, created_at: new Date().toISOString(), game_type: arena.gameType || 'import', challenge_minutes: arena.challengeMinutes }
    ;(memory as any).arenas = (memory as any).arenas || new Map<string, any>()
    ;(memory as any).arenas.set(a.code, a)
    return a
  }
  , getArenaByCode: async (code: string): Promise<any | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('arenas').select('*').eq('code', code).single()
      if (!error) return data
      const msg = (error as any)?.message || ''
      if (msg.includes('relation') && msg.includes('does not exist')) {
        return memory.arenas.get(code)
      }
      return undefined
    }
    return memory.arenas.get(code)
  }
  , updateArena: async (code: string, values: any): Promise<any | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('arenas').update(values).eq('code', code).select().single()
      if (!error) return data
      const msg = (error as any)?.message || ''
      if (msg.includes('relation') && msg.includes('does not exist')) {
        const a = memory.arenas.get(code)
        if (!a) return undefined
        const u = { ...a, ...values }
        memory.arenas.set(code, u)
        return u
      }
      return undefined
    }
    const a = memory.arenas.get(code)
    if (!a) return undefined
    const u = { ...a, ...values }
    memory.arenas.set(code, u)
    return u
  }
  , getArenaById: async (arenaId: string): Promise<any | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('arenas').select('*').eq('id', arenaId).single()
      if (error) return undefined
      return data
    }
    const byId = [...memory.arenas.values()].find((a: any) => a.id === arenaId)
    return byId
  }
  , updateArenaById: async (arenaId: string, values: any): Promise<any | undefined> => {
    if (supabase) {
      const { data, error } = await supabase.from('arenas').update(values).eq('id', arenaId).select().single()
      if (error) return undefined
      return data
    }
    const a = [...memory.arenas.values()].find((x: any) => x.id === arenaId)
    if (!a) return undefined
    const u = { ...a, ...values }
    memory.arenas.set(u.code || arenaId, u)
    return u
  }
  , listArenas: async (accountId?: string): Promise<any[]> => {
    if (supabase) {
      if (accountId) {
        const { data, error } = await supabase
          .from('arenas')
          .select('*')
          .or(`creator_account_id.eq.${accountId},joiner_account_id.eq.${accountId}`)
          .order('created_at', { ascending: false })
        if (error) throw error
        return data
      } else {
        const { data, error } = await supabase.from('arenas').select('*').order('created_at', { ascending: false })
        if (error) throw error
        return data
      }
    }
    const arr = [...memory.arenas.values()]
    return accountId ? arr.filter(a => a.creator_account_id === accountId || a.joiner_account_id === accountId) : arr
  }
  , deleteArenaById: async (arenaId: string): Promise<boolean> => {
    if (supabase) {
      const { error } = await supabase.from('arenas').delete().eq('id', arenaId)
      if (error) throw error
      return true
    }
    const found = [...memory.arenas.values()].find((a: any) => a.id === arenaId)
    if (!found) return false
    memory.arenas.delete(found.code)
    return true
  }
  , getUserByAccountId: async (accountId: string): Promise<any | undefined> => {
    if (supabase) {
      const { data } = await supabase.from('users').select('*').eq('account_id', accountId).maybeSingle()
      if (!data) return undefined
      return data
    }
    return undefined
  }
  , updateUserElo: async (accountId: string, rating: number): Promise<void> => {
    if (supabase) {
      await supabase.from('users').update({ elo_rating: rating }).eq('account_id', accountId)
      return
    }
  }
  , listLeaderboardAccounts: async (): Promise<{ accountId: string; name?: string; elo: number; agentCount: number }[]> => {
    if (supabase) {
      const { data: users } = await supabase.from('users').select('account_id,name,elo_rating')
      const { data: agents } = await supabase.from('agents').select('owner_account_id')
      const countsMap = new Map<string, number>()
      for (const row of (agents || [])) {
        const owner = row.owner_account_id
        if (owner) countsMap.set(owner, (countsMap.get(owner) || 0) + 1)
      }
      return (users || []).map((u: any) => ({ accountId: u.account_id, name: u.name, elo: u.elo_rating || 1000, agentCount: countsMap.get(u.account_id) || 0 }))
    }
    return []
  }
}

export const persistenceInfo = { useSupabase }
