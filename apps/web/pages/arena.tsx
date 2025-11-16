import { useEffect, useRef, useState } from 'react'
import { listAgents, listMatches, createArena, getArenaById, getArenaByCode, joinArenaByCode, startArena, setArenaReady, listArenas, deleteArena, watchArena, listWatchArenas } from '../lib/api'

export default function Arena() {
  const [agents, setAgents] = useState<any[]>([])
  const [topic, setTopic] = useState('')
  const [gameType, setGameType] = useState<'import'|'challenge'>('import')
  const [challengeMinutes, setChallengeMinutes] = useState(5)
  const [modal, setModal] = useState<null | { type: 'create' | 'join' }>(null)
  const [createdId, setCreatedId] = useState('')
  const [inputId, setInputId] = useState('')
  const [joinStep, setJoinStep] = useState<'enter'|'choose'|'error'|'already'>('enter')
  const [joinArenaMeta, setJoinArenaMeta] = useState<any | null>(null)
  const [joinRole, setJoinRole] = useState('')
  const [arena, setArena] = useState<any | null>(null)
  const [match, setMatch] = useState<any | null>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [myArenas, setMyArenas] = useState<any[]>([])
  const [watchArenas, setWatchArenas] = useState<any[]>([])
  const [myLimit, setMyLimit] = useState<number>(3)
  const [watchLimit, setWatchLimit] = useState<number>(3)
  const pollingRef = useRef<any>(null)
  const accId = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''

  useEffect(() => {
    const accRaw = typeof window !== 'undefined' ? sessionStorage.getItem('accountId') : null
    const acc = accRaw ? accRaw.trim() : null
    if (!acc) {
      window.location.href = '/'
      return
    }
    listAgents().then(setAgents)
    listMatches().then(setRecent)
    listArenas(acc || undefined).then(setMyArenas)
    if (acc) {
      listWatchArenas(acc).then(async d => {
        const arr = Array.isArray(d) ? d : []
        if (arr.length > 0) { setWatchArenas(arr); return }
        const all = await listArenas(undefined)
        const fallback = Array.isArray(all) ? all.filter((a: any) => Array.isArray(a.watcher_account_ids) && a.watcher_account_ids.some((w: any) => String(w).trim() === acc)) : []
        setWatchArenas(fallback)
      })
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  return (
    <div className="page py-8 space-y-6">
      <h2 className="text-3xl font-bold">Arena</h2>
      <div className="flex gap-3">
        <button className="btn-primary" onClick={()=> setModal({ type: 'create' })}>Create Arena</button>
        <button className="btn-secondary" onClick={()=> { setModal({ type: 'join' }); setJoinStep('enter'); setJoinArenaMeta(null); setInputId('') }}>Join Arena</button>
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">My Arena</h3>
        <div className="grid grid-cols-1 gap-3">
          {myArenas.slice(0, myLimit).map((a: any) => {
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
                    <div className="flex items-center gap-2">
                      <span className="badge bg-white border text-brand-brown/80">{a.game_type === 'challenge' ? 'Challenge' : 'Import'}</span>
                      <span className={`badge ${statusColor}`}>{a.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a className="btn-outline" href={`/arena/${a.id}`}>Open</a>
                    {isCreator && a.status !== 'completed' && (
                      <button aria-label="Delete Arena" className="btn-outline text-red-600 border-red-600 hover:bg-red-50 h-10" onClick={async () => {
                        await deleteArena(a.id, accId)
                        const updated = await listArenas(accId)
                        setMyArenas(updated)
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 6V4h6v2m1 2-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 8m4 4v6m6-6v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {myArenas.length > myLimit && (
          <div className="flex justify-center mt-2">
            <button className="btn-outline" onClick={()=> setMyLimit(l => Math.min(l+3, myArenas.length))}>Load More</button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">(Watch-only) Arena</h3>
        {watchArenas.length === 0 ? (
          <div className="text-sm text-brand-brown/60">Belum ada arena yang kamu tonton.</div>
        ) : (
          <>
          <div className="grid grid-cols-1 gap-3">
            {(Array.isArray(watchArenas) ? watchArenas : []).slice(0, watchLimit).map((a: any) => {
              const statusText = String(a.status||'').toLowerCase()
              const statusColor = statusText === 'completed' ? 'bg-green-100 text-green-800' : statusText === 'cancelled' ? 'bg-red-100 text-red-800' : statusText === 'matching' ? 'bg-blue-100 text-blue-800' : statusText === 'waiting' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
              const titleText = (String(a.topic||'').length > 60) ? (String(a.topic||'').slice(0, 60) + '…') : String(a.topic||'')
              return (
                <div key={a.id} className="card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <a href={`/arena/${a.id}`} className="block">
                        <div className="text-sm text-brand-brown/60">Code <span className="font-mono">{a.code || '-'}</span></div>
                        <div className="text-lg font-semibold" title={a.topic}>{titleText}</div>
                      </a>
                      <div className="flex items-center gap-2">
                        <span className="badge bg-white border text-brand-brown/80">{a.game_type === 'challenge' ? 'Challenge' : 'Import'}</span>
                        <span className={`badge ${statusColor}`}>{a.status}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <a className="btn-outline" href={`/arena/${a.id}`}>Open</a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {((Array.isArray(watchArenas) ? watchArenas.length : 0) > watchLimit) && (
            <div className="flex justify-center mt-2">
              <button className="btn-outline" onClick={()=> setWatchLimit(l => Math.min(l+3, (Array.isArray(watchArenas) ? watchArenas.length : 0)))}>Load More</button>
            </div>
          )}
          </>
        )}
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
                {joinStep === 'enter' && (
                  <>
                    <div className="font-semibold">Join Arena</div>
                    <input className="input" placeholder="Arena Code" value={inputId} onChange={e => setInputId(e.target.value.toUpperCase())} />
                    <div className="flex gap-2 justify-end">
                      <button className="btn-outline" onClick={()=> setModal(null)}>Cancel</button>
                      <button className="btn-secondary" onClick={async () => {
                        const code = inputId.trim().toUpperCase()
                        if (!code) return
                        const found = await getArenaByCode(code)
                        if (found && !found.error && found.id) {
                          const acc = (sessionStorage.getItem('accountId') || '').trim()
                          const p1 = (found.player1_account_id && found.player1_account_id === acc) || (found.creator_account_id && found.creator_account_id === acc)
                          const p2 = (found.player2_account_id && found.player2_account_id === acc) || (found.joiner_account_id && found.joiner_account_id === acc)
                          const watchers = Array.isArray(found.watcher_account_ids) ? found.watcher_account_ids : []
                          const w = watchers.includes(acc)
                          setJoinArenaMeta(found)
                          if (p1 || p2 || w) {
                            setJoinRole(p1 ? 'Player 1' : (p2 ? 'Player 2' : 'Watcher'))
                            setJoinStep('already')
                          } else {
                            setJoinStep('choose')
                          }
                        } else {
                          setJoinStep('error')
                        }
                      }}>Next</button>
                    </div>
                  </>
                )}
                {joinStep === 'error' && (
                  <>
                    <div className="font-semibold">Room Not Found</div>
                    <div className="text-sm text-brand-brown/60">Code tidak valid atau room tidak tersedia.</div>
                    <div className="flex gap-2 justify-end">
                      <button className="btn-secondary" onClick={()=> setJoinStep('enter')}>Back</button>
                      <button className="btn-outline" onClick={()=> setModal(null)}>Close</button>
                    </div>
                  </>
                )}
                {joinStep === 'already' && joinArenaMeta && (
                  <>
                    <div className="font-semibold">Kamu sudah terdaftar</div>
                    <div className="text-sm text-brand-brown/60">Peran: {joinRole}. Ingin membuka room sekarang?</div>
                    <div className="flex gap-2 justify-end">
                      <button className="btn-outline" onClick={()=> setModal(null)}>Close</button>
                      <button className="btn-primary" onClick={() => {
                        setModal(null)
                        if (typeof window !== 'undefined') window.location.href = `/arena/${joinArenaMeta.id}`
                      }}>Open Room</button>
                    </div>
                  </>
                )}
                {joinStep === 'choose' && joinArenaMeta && (
                  <>
                    <div className="font-semibold">Room Ditemukan</div>
                    <div className="text-sm">
                      <div>Code <span className="font-mono">{joinArenaMeta.code}</span></div>
                      <div className="font-semibold mt-1">{joinArenaMeta.topic}</div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button className="btn-outline" onClick={()=> setModal(null)}>Cancel</button>
                      { !((joinArenaMeta.player1_account_id||joinArenaMeta.creator_account_id) && (joinArenaMeta.player2_account_id||joinArenaMeta.joiner_account_id)) && (
                      <button className="btn-secondary" onClick={async () => {
                        const acc = (sessionStorage.getItem('accountId') || '').trim()
                        const joined = await joinArenaByCode(joinArenaMeta.code, acc)
                        if (joined && joined.id && !joined.error) {
                          setModal(null)
                          if (typeof window !== 'undefined') window.location.href = `/arena/${joined.id}`
                        } else {
                          alert('Room penuh atau tidak tersedia. Membuka sebagai watcher.')
                          try {
                            await watchArena(joinArenaMeta.id, acc)
                            const updated = await listWatchArenas(acc)
                            const arr = Array.isArray(updated) ? updated : []
                            if (arr.length > 0) setWatchArenas(arr)
                            else {
                              const all = await listArenas(undefined)
                              const fallback = Array.isArray(all) ? all.filter((a: any) => Array.isArray(a.watcher_account_ids) && a.watcher_account_ids.some((w: any) => String(w).trim() === acc)) : []
                              setWatchArenas(fallback)
                            }
                          } catch {}
                          setModal(null)
                          if (typeof window !== 'undefined') window.location.href = `/arena/${joinArenaMeta.id}`
                        }
                      }}>Join as Player</button>
                      )}
                      <button className="btn-primary" onClick={async () => {
                        const acc = (sessionStorage.getItem('accountId') || '').trim()
                        try {
                          await watchArena(joinArenaMeta.id, acc)
                          const updated = await listWatchArenas(acc)
                          const arr = Array.isArray(updated) ? updated : []
                          if (arr.length > 0) setWatchArenas(arr)
                          else {
                            const all = await listArenas(undefined)
                            const fallback = Array.isArray(all) ? all.filter((a: any) => Array.isArray(a.watcher_account_ids) && a.watcher_account_ids.some((w: any) => String(w).trim() === acc)) : []
                            setWatchArenas(fallback)
                          }
                        } catch {}
                        setModal(null)
                        if (typeof window !== 'undefined') window.location.href = `/arena/${joinArenaMeta.id}`
                      }}>Join as Watcher</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
