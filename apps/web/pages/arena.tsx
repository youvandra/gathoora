import { useEffect, useRef, useState } from 'react'
import { listAgents, listMatches, createArena, getArenaById, joinArenaByCode, startArena, setArenaReady, listArenas, deleteArena } from '../lib/api'

export default function Arena() {
  const [agents, setAgents] = useState<any[]>([])
  const [topic, setTopic] = useState('')
  const [gameType, setGameType] = useState<'import'|'challenge'>('import')
  const [challengeMinutes, setChallengeMinutes] = useState(5)
  const [modal, setModal] = useState<null | { type: 'create' | 'join' }>(null)
  const [createdId, setCreatedId] = useState('')
  const [inputId, setInputId] = useState('')
  const [arena, setArena] = useState<any | null>(null)
  const [match, setMatch] = useState<any | null>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [myArenas, setMyArenas] = useState<any[]>([])
  const pollingRef = useRef<any>(null)
  const accId = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? sessionStorage.getItem('accountId') : null
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
    <div className="page py-8 space-y-6">
      <h2 className="text-3xl font-bold">Arena</h2>
      <div className="flex gap-3">
        <button className="btn-primary" onClick={()=> setModal({ type: 'create' })}>Create Arena</button>
        <button className="btn-secondary" onClick={()=> setModal({ type: 'join' })}>Join Arena</button>
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">My Arena</h3>
        <div className="grid grid-cols-1 gap-3">
          {myArenas.map((a: any) => {
            const statusText = String(a.status||'').toLowerCase()
          const statusColor = statusText === 'completed' ? 'bg-green-100 text-green-800' : statusText === 'cancelled' ? 'bg-red-100 text-red-800' : statusText === 'matching' ? 'bg-blue-100 text-blue-800' : statusText === 'waiting' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
            const isCreator = a.creator_account_id === accId
            const isJoiner = a.joiner_account_id === accId
            const titleText = (String(a.topic||'').length > 60) ? (String(a.topic||'').slice(0, 60) + '…') : String(a.topic||'')
            return (
              <div key={a.id} className="card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <a href={`/arena/${a.id}`} className="block">
                      <div className="text-sm text-brand-brown/60">Code <span className="font-mono">{a.code || '-'}</span></div>
                      <div className="text-lg font-semibold" title={a.topic}>{titleText}</div>
                    </a>
                    {statusText === 'waiting' && (
                      <div className="space-y-1">
                        <div className="text-xs text-brand-brown/60">Players</div>
                        <div className="flex items-center gap-2">
                          <span className="badge bg-white border text-brand-brown/80">
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${a.creator_ready ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                            {(isCreator ? 'You' : 'Opponent')} {a.creator_ready ? 'Ready' : 'Not Ready'}
                          </span>
                          <span className="badge bg-white border text-brand-brown/80">
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${a.joiner_ready ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                            {(isJoiner ? 'You' : 'Opponent')} {a.joiner_ready ? 'Ready' : 'Not Ready'}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="badge bg-white border text-brand-brown/80">{a.game_type === 'challenge' ? 'Challenge' : 'Import'}</span>
                      <span className={`badge ${statusColor}`}>{a.status}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <a className="btn-outline" href={`/arena/${a.id}`}>Open</a>
                    {isCreator && a.status !== 'completed' && (
                      <button className="btn-outline" onClick={async () => {
                        await deleteArena(a.id, accId)
                        const updated = await listArenas(accId)
                        setMyArenas(updated)
                      }}>Delete</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {match && (
        <div className="space-y-3">
          <div className="card">Winner: {(
            match.winnerAgentId ? agents.find(x => x.id === match.winnerAgentId)?.name : 'Tie'
          )}</div>
          <div className="card">
            <div className="font-semibold">Judge Scores</div>
            <div className="grid grid-cols-3 gap-2">
              {match.judgeScores.map((j: any) => (
                <div key={j.judgeId} className="card">{j.judgeId}: A {j.agentAScore.toFixed(2)} / B {j.agentBScore.toFixed(2)}</div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {match.rounds.map((r: any, idx: number) => (
              <div key={idx} className="card">
                <div className="font-semibold">{r.round} - {agents.find(x => x.id === r.agentId)?.name || r.agentId}</div>
                <div className="whitespace-pre-wrap">{r.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={()=> setModal(null)}>
          <div className="modal-card" onClick={e=> e.stopPropagation()}>
            {modal.type === 'create' && (
              <div className="space-y-3">
                <div className="font-semibold">Create Arena</div>
                <input className="input" placeholder="Topic" value={topic} onChange={e => setTopic(e.target.value)} />
                <div className="flex gap-2 items-center">
                  <select className="select" value={gameType} onChange={e => setGameType(e.target.value as any)}>
                    <option value="import">Import agents</option>
                    <option value="challenge">Challenge (write knowledge)</option>
                  </select>
                  {gameType === 'challenge' && (
                    <input type="number" min={1} max={60} className="input w-32" value={challengeMinutes} onChange={e => setChallengeMinutes(Number(e.target.value))} placeholder="Minutes" />
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <button className="btn-outline" onClick={()=> setModal(null)}>Cancel</button>
                  <button className="btn-primary" onClick={async () => {
                    const acc = sessionStorage.getItem('accountId') || ''
                    if (!acc || !topic) return
                    try {
                      const a = await createArena(topic, acc, gameType, gameType === 'challenge' ? challengeMinutes : undefined)
                      setArena(a)
                      setCreatedId(a.id)
                      setModal(null)
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
                  }}>Create</button>
                </div>
              </div>
            )}
            {modal.type === 'join' && (
              <div className="space-y-3">
                <div className="font-semibold">Join Arena</div>
                <input className="input" placeholder="Arena Code" value={inputId} onChange={e => setInputId(e.target.value.toUpperCase())} />
                <div className="flex gap-2 justify-end">
                  <button className="btn-outline" onClick={()=> setModal(null)}>Cancel</button>
                  <button className="btn-secondary" onClick={async () => {
                    const acc = sessionStorage.getItem('accountId') || ''
                    const code = inputId.trim().toUpperCase()
                    if (!acc || !code) return
                    try {
                      const joined = await joinArenaByCode(code, acc)
                      setModal(null)
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
                  }}>Join</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
