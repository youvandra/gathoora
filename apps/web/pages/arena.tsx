import { useEffect, useRef, useState } from 'react'
import { listAgents, listMatches, createArena, getArenaById, joinArenaByCode, startArena, setArenaReady, listArenas, deleteArena } from '../lib/api'

export default function Arena() {
  const [agents, setAgents] = useState<any[]>([])
  const [topic, setTopic] = useState('')
  const [gameType, setGameType] = useState<'import'|'challenge'>('import')
  const [challengeMinutes, setChallengeMinutes] = useState(5)
  const [mode, setMode] = useState<'create'|'join'>('create')
  const [createdId, setCreatedId] = useState('')
  const [inputId, setInputId] = useState('')
  const [arena, setArena] = useState<any | null>(null)
  const [match, setMatch] = useState<any | null>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [myArenas, setMyArenas] = useState<any[]>([])
  const pollingRef = useRef<any>(null)
  const accId = typeof window !== 'undefined' ? (localStorage.getItem('accountId') || '') : ''

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null
    if (!acc) {
      window.location.href = '/'
      return
    }
    listAgents().then(setAgents)
    listMatches().then(setRecent)
    listArenas(acc).then(setMyArenas)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Arena</h2>
      <div className="space-y-3">
        <div className="flex gap-2">
          <button className={`px-3 py-1 border ${mode==='create'?'bg-gray-200':''}`} onClick={()=>setMode('create')}>Create</button>
          <button className={`px-3 py-1 border ${mode==='join'?'bg-gray-200':''}`} onClick={()=>setMode('join')}>Join</button>
        </div>
        {mode === 'create' ? (
          <div className="space-y-2">
            <input className="w-full border p-2" placeholder="Topic" value={topic} onChange={e => setTopic(e.target.value)} />
            <div className="flex gap-2">
              <select className="border p-2" value={gameType} onChange={e => setGameType(e.target.value as any)}>
                <option value="import">Import agents</option>
                <option value="challenge">Challenge (write knowledge)</option>
              </select>
              {gameType === 'challenge' && (
                <input type="number" min={1} max={60} className="border p-2 w-32" value={challengeMinutes} onChange={e => setChallengeMinutes(Number(e.target.value))} placeholder="Minutes" />
              )}
            </div>
            <button className="px-4 py-2 bg-purple-600 text-white" onClick={async () => {
              const acc = localStorage.getItem('accountId') || ''
              if (!acc || !topic) return
              try {
                const a = await createArena(topic, acc, gameType, gameType === 'challenge' ? challengeMinutes : undefined)
                setArena(a)
                setCreatedId(a.id)
                if (typeof window !== 'undefined') window.location.href = `/arena/${a.id}`
                pollingRef.current = setInterval(async () => {
                  const curr = await getArenaById(a.id)
                  setArena(curr)
                  if (curr.match_id) {
                    clearInterval(pollingRef.current)
                  }
                }, 2000)
              } catch (e: any) {
                alert(e?.message || 'Failed to create arena')
              }
            }}>Create Arena</button>
            {createdId && <div className="border p-2">Arena ID: <span className="font-mono">{createdId}</span></div>}
            {arena && (
              <div className="space-y-2 border p-2">
                <div>Status: {arena.status}</div>
                <div>Ready: You {arena.creator_ready ? '✅' : '❌'} | Opponent {arena.joiner_ready ? '✅' : '❌'}</div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 border" onClick={async ()=>{ if (!arena) return; await setArenaReady(arena.id, 'creator', true); const curr = await getArenaById(arena.id); setArena(curr) }}>Ready</button>
                  <button className="px-3 py-1 border" disabled={!(arena.agent_a_id && arena.agent_b_id && arena.creator_ready && arena.joiner_ready && !arena.match_id)} onClick={async ()=>{ const res = await startArena(arena.id); setMatch(res.match); const curr = await getArenaById(arena.id); setArena(curr) }}>Start Debate</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <input className="w-full border p-2" placeholder="Arena Code" value={inputId} onChange={e => setInputId(e.target.value.toUpperCase())} />
            <button className="px-4 py-2 bg-green-600 text-white" onClick={async () => {
              const acc = localStorage.getItem('accountId') || ''
              const code = inputId.trim().toUpperCase()
              if (!acc || !code) return
              try {
                const joined = await joinArenaByCode(code, acc)
                if (typeof window !== 'undefined') window.location.href = `/arena/${joined.id}`
                pollingRef.current = setInterval(async () => {
                  const curr = await getArenaById(joined.id)
                  setArena(curr)
                  if (curr.match_id) {
                    clearInterval(pollingRef.current)
                  }
                }, 2000)
              } catch (e: any) {
                alert(e?.message || 'Failed to join arena')
              }
            }}>Join Arena</button>
            {arena && (
              <div className="space-y-2 border p-2">
                <div>Status: {arena.status}</div>
                <div>Ready: Opponent {arena.creator_ready ? '✅' : '❌'} | You {arena.joiner_ready ? '✅' : '❌'}</div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 border" onClick={async ()=>{ if (!arena) return; await setArenaReady(arena.id, 'joiner', true); const curr = await getArenaById(arena.id); setArena(curr) }}>Ready</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">My Arena</h3>
        <div className="grid grid-cols-1 gap-2">
          {myArenas.map((a: any) => (
            <div key={a.id} className="border p-2 flex items-center justify-between">
              <a href={`/arena/${a.id}`} className="block">
                <div>ID: <span className="font-mono">{a.id}</span></div>
                <div>Code: <span className="font-mono">{a.code || '-'}</span></div>
                <div>Topic: {a.topic}</div>
                <div className="text-sm">Ready: {(a.creator_account_id === accId ? 'You' : 'Opponent')} {a.creator_ready ? '✅' : '❌'} | {(a.joiner_account_id === accId ? 'You' : 'Opponent')} {a.joiner_ready ? '✅' : '❌'}</div>
              </a>
              {a.creator_account_id === accId && a.status !== 'completed' && (
                <button className="ml-4 px-3 py-1 border" onClick={async () => {
                  await deleteArena(a.id, accId)
                  const updated = await listArenas(accId)
                  setMyArenas(updated)
                }}>Delete</button>
              )}
            </div>
          ))}
        </div>
      </div>
      {match && (
        <div className="space-y-3">
          <div className="border p-3">Winner: {(
            match.winnerAgentId ? agents.find(x => x.id === match.winnerAgentId)?.name : 'Tie'
          )}</div>
          <div className="border p-3">
            <div className="font-semibold">Judge Scores</div>
            <div className="grid grid-cols-3 gap-2">
              {match.judgeScores.map((j: any) => (
                <div key={j.judgeId} className="border p-2">{j.judgeId}: A {j.agentAScore.toFixed(2)} / B {j.agentBScore.toFixed(2)}</div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {match.rounds.map((r: any, idx: number) => (
              <div key={idx} className="border p-2">
                <div className="font-semibold">{r.round} - {agents.find(x => x.id === r.agentId)?.name || r.agentId}</div>
                <div className="whitespace-pre-wrap">{r.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">Recent Matches</h3>
        <div className="grid grid-cols-1 gap-2">
          {recent.map((m: any) => (
            <div key={m.id} className="border p-2">
              <div>{m.topic}</div>
              <div className="text-sm">A: {agents.find(x => x.id === m.agentAId)?.name} vs B: {agents.find(x => x.id === m.agentBId)?.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
