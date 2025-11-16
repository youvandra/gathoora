import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { listAgents, getArenaById, joinArena, selectArenaAgent, setArenaReady, startArena, deleteArena, submitArenaKnowledge, challengeControl, saveArenaDraft, getMatch, listKnowledgePacks, cancelArena } from '../../lib/api'

export default function ArenaRoom() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const [agents, setAgents] = useState<any[]>([])
  const [arena, setArena] = useState<any | null>(null)
  const [myAgent, setMyAgent] = useState('')
  const [status, setStatus] = useState('')
  const [match, setMatch] = useState<any | null>(null)
  const [packs, setPacks] = useState<any[]>([])
  const pollingRef = useRef<any>(null)

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? sessionStorage.getItem('accountId') : null
    if (!acc) { window.location.href = '/'; return }
  }, [])

  useEffect(() => {
    if (!id) return
    listAgents().then(setAgents)
    listKnowledgePacks().then(setPacks).catch(()=>{})
    ;(async () => {
      try {
        const a = await getArenaById(id)
        setArena(a)
        if (a && a.match_id) {
          try { const m = await getMatch(a.match_id); setMatch(m) } catch {}
        } else { setMatch(null) }
      } catch {}
    })()
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const a = await getArenaById(id)
        setArena(a)
        if (a && a.match_id) {
          try { const m = await getMatch(a.match_id); setMatch(m) } catch {}
        }
      } catch {}
    }, 2000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [id])

  const accId = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
  const isCreator = arena?.creator_account_id === accId
  const isJoiner = arena?.joiner_account_id === accId
  const mySide: 'pros'|'cons'|undefined = isCreator ? arena?.creator_side : (isJoiner ? arena?.joiner_side : undefined)
  const [challengeText, setChallengeText] = useState('')
  const [challengeAgentName, setChallengeAgentName] = useState('')
  const myWritingStatus: 'idle'|'writing'|'paused'|'finished'|undefined = isCreator ? arena?.creator_writing_status : (isJoiner ? arena?.joiner_writing_status : undefined)
  const myWritingStartedAt: string | undefined = isCreator ? arena?.creator_writing_started_at : (isJoiner ? arena?.joiner_writing_started_at : undefined)
  const myPausedSecs: number = isCreator ? (arena?.creator_paused_secs || 0) : (isJoiner ? (arena?.joiner_paused_secs || 0) : 0)
  const myPausedAt: string | undefined = isCreator ? arena?.creator_paused_at : (isJoiner ? arena?.joiner_paused_at : undefined)
  const youReady = isCreator ? !!arena?.creator_ready : (isJoiner ? !!arena?.joiner_ready : false)
  const oppReady = isCreator ? !!arena?.joiner_ready : !!arena?.creator_ready
  const youSubmitted = isCreator ? !!arena?.creator_knowledge_submitted : (isJoiner ? !!arena?.joiner_knowledge_submitted : false)
  const oppSubmitted = isCreator ? !!arena?.joiner_knowledge_submitted : !!arena?.creator_knowledge_submitted
  const youAgentId = mySide === 'pros' ? arena?.agent_a_id : (mySide === 'cons' ? arena?.agent_b_id : undefined)
  const oppAgentId = mySide === 'pros' ? arena?.agent_b_id : (mySide === 'cons' ? arena?.agent_a_id : undefined)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const autoSubmitRef = useRef<boolean>(false)
  useEffect(() => {
    if (!arena || arena.status !== 'challenge' || !arena.challenge_minutes) return
    if (!myWritingStartedAt) { setTimeLeft(arena.challenge_minutes * 60); return }
    const total = arena.challenge_minutes * 60
    const computeRunning = () => {
      const elapsed = Math.floor((Date.now() - new Date(myWritingStartedAt).getTime()) / 1000) - (myPausedSecs || 0)
      const secs = Math.max(0, total - Math.max(0, elapsed))
      setTimeLeft(secs)
    }
    const computePaused = () => {
      const pausedAtTs = myPausedAt ? new Date(myPausedAt).getTime() : Date.now()
      const elapsed = Math.floor((pausedAtTs - new Date(myWritingStartedAt).getTime()) / 1000) - (myPausedSecs || 0)
      const secs = Math.max(0, total - Math.max(0, elapsed))
      setTimeLeft(secs)
    }
    if (myWritingStatus === 'writing') {
      computeRunning()
      const int = setInterval(computeRunning, 1000)
      return () => clearInterval(int)
    } else {
      computePaused()
    }
  }, [arena?.challenge_minutes, arena?.status, myWritingStartedAt, myWritingStatus, myPausedSecs, myPausedAt])

  useEffect(() => {
    if (!arena || arena.status !== 'challenge') return
    if (timeLeft > 0) return
    if (autoSubmitRef.current) return
    autoSubmitRef.current = true
    ;(async () => {
      try {
        const needCancel = !arena.creator_knowledge_submitted || !arena.joiner_knowledge_submitted
        if (needCancel) {
          await cancelArena(arena.id)
          const a = await getArenaById(id as string)
          setArena(a)
          setStatus('Waktu habis. Arena dibatalkan')
          return
        }
      } catch (e: any) {
        setStatus(e?.message || 'Gagal membatalkan arena')
      }
    })()
  }, [timeLeft, arena?.status, arena?.creator_knowledge_submitted, arena?.joiner_knowledge_submitted, id])

  useEffect(() => {
    if (!arena) return
    const serverText = isCreator ? arena?.creator_draft_text : (isJoiner ? arena?.joiner_draft_text : '')
    const serverName = isCreator ? arena?.creator_draft_agent_name : (isJoiner ? arena?.joiner_draft_agent_name : '')
    if (!challengeText && typeof serverText === 'string') {
      setChallengeText(serverText)
    }
    if (!challengeAgentName && typeof serverName === 'string') {
      setChallengeAgentName(serverName)
    }
  }, [arena?.creator_draft_text, arena?.joiner_draft_text, arena?.creator_draft_agent_name, arena?.joiner_draft_agent_name, isCreator, isJoiner, challengeText, challengeAgentName])

  async function handleJoin() {
    if (!id || !accId) return
    try {
      await joinArena(id, accId)
      const a = await getArenaById(id)
      setArena(a)
    } catch (e: any) {
      setStatus(e?.message || 'Join failed')
    }
  }

  async function handleSelectAgent(side: 'pros' | 'cons') {
    if (!id || !myAgent) return
    await selectArenaAgent(id, side, myAgent)
    const a = await getArenaById(id)
    setArena(a)
  }

  async function handleReady(side: 'creator' | 'joiner') {
    if (!id) return
    await setArenaReady(id, side, true)
    const a = await getArenaById(id)
    setArena(a)
  }

  async function handleStart() {
    if (!id) return
    try {
      const res = await startArena(id)
      setArena(res.arena)
      if (typeof window !== 'undefined') {
        window.location.href = `/arena/${id}/debateroom`
      }
    } catch (e: any) {
      setStatus(e?.message || 'Failed to start')
    }
  }

  return (
    <div className="page py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold">Arena Room</h2>
          <div className="flex items-center gap-2 text-sm text-brand-brown/60">
            <span>Code <span className="font-mono">{arena?.code || '-'}</span></span>
            {arena?.code && (
              <button className="btn-ghost btn-sm btn-compact" onClick={async ()=>{ try { await navigator.clipboard.writeText(String(arena.code)) } catch {}; setStatus('Code copied') }}>
                Copy
              </button>
            )}
          </div>
        </div>
        {arena && (
          <div className="flex items-center gap-2">
            <span className="badge bg-white border text-brand-brown/80">{arena.game_type === 'challenge' ? 'Challenge' : 'Import'}</span>
            <span className={`badge ${String(arena.status||'').toLowerCase() === 'completed' ? 'bg-green-100 text-green-800' : String(arena.status||'').toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800' : String(arena.status||'').toLowerCase() === 'matching' ? 'bg-blue-100 text-blue-800' : String(arena.status||'').toLowerCase() === 'waiting' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{arena.status}</span>
          </div>
        )}
      </div>
      {status && <div className={`text-sm ${/berhasil|sukses/i.test(status) ? 'text-green-600' : 'text-red-600'}`}>{status}</div>}
      {!arena ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-4">
          <div className="card p-6">
            <div className="text-sm text-brand-brown/60">Topic</div>
            <div className="text-xl font-semibold">{arena.topic}</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="font-semibold">Participants</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${isCreator || isJoiner ? (youReady ? 'bg-green-500' : 'bg-gray-400') : 'bg-gray-400'}`}></span>
                      <span className="text-sm">You</span>
                    </div>
                    <div className="text-xs text-brand-brown/60 font-mono truncate">{(isCreator || isJoiner) ? (isCreator ? (arena.creator_account_id || '-') : (arena.joiner_account_id || '-')) : '-'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${oppReady ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      <span className="text-sm">Opponent</span>
                    </div>
                    <div className="text-xs text-brand-brown/60 font-mono truncate">{isCreator ? (arena.joiner_account_id || '-') : (arena.creator_account_id || '-')}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="font-semibold">Side</div>
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-brand-brown/60">You</div>
                      <span className={`badge ${mySide==='pros' ? 'bg-green-100 text-green-800' : mySide==='cons' ? 'bg-rose-100 text-rose-800' : 'bg-white border text-brand-brown/80'}`}>
                        <span className="font-bold">{mySide || '-'}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-brand-brown/60">Opponent</div>
                      <span className={`badge ${(isCreator ? arena.joiner_side : arena.creator_side)==='pros' ? 'bg-green-100 text-green-800' : (isCreator ? arena.joiner_side : arena.creator_side)==='cons' ? 'bg-rose-100 text-rose-800' : 'bg-white border text-brand-brown/80'}`}>
                        {(isCreator ? (arena.joiner_side || '-') : (arena.creator_side || '-'))}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="font-semibold">Submitted</div>
                  <div className="flex items-center gap-2">
                    <span className="badge bg-white border text-brand-brown/80">You {youSubmitted ? '✅' : '❌'}</span>
                    <span className="badge bg-white border text-brand-brown/80">Opponent {oppSubmitted ? '✅' : '❌'}</span>
                  </div>
                </div>
                {(String(arena.status||'').toLowerCase() === 'waiting') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isCreator && <button className="btn-outline" onClick={()=>handleReady('creator')}>Ready</button>}
                    {isJoiner && <button className="btn-outline" onClick={()=>handleReady('joiner')}>Ready</button>}
                  </div>
                )}
                {(String(arena.status||'').toLowerCase() !== 'completed') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isCreator && !arena.match_id && ((arena.game_type !== 'challenge' && arena.status === 'select_agent' && arena.agent_a_id && arena.agent_b_id && arena.creator_ready && arena.joiner_ready) || (arena.game_type === 'challenge' && arena.status === 'challenge' && arena.agent_a_id && arena.agent_b_id && arena.creator_knowledge_submitted && arena.joiner_knowledge_submitted)) && (
                      <button className="btn-primary" onClick={handleStart}>Start Debate</button>
                    )}
                  </div>
                )}
                {match && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="text-sm">Final Score (A): {Number(((match.judgeScores||[]).reduce((s: number, j: any)=> s + (j.agentAScore||0), 0))/Math.max(1,(match.judgeScores||[]).length)).toFixed(2)}</div>
                    <div className="text-sm">Final Score (B): {Number(((match.judgeScores||[]).reduce((s: number, j: any)=> s + (j.agentBScore||0), 0))/Math.max(1,(match.judgeScores||[]).length)).toFixed(2)}</div>
                  </div>
                )}
              </div>
              
            </div>
            {String(arena.status||'').toLowerCase() === 'completed' && (
              <div className="mt-4 flex justify-end">
                <a className="btn-primary" href={`/arena/${id}/debateroom`}>View Results</a>
              </div>
            )}
          </div>
          {!arena.joiner_account_id && !isCreator && (
            <button className="btn-outline" onClick={handleJoin}>Join Room</button>
          )}
          {arena.game_type !== 'challenge' && (
            <div className="space-y-2 card p-4">
              <div className="font-semibold">Agents</div>
              <div className="text-sm">Pros {arena.agent_a_id ? agents.find(x => x.id === arena.agent_a_id)?.name : '-'} · Cons {arena.agent_b_id ? agents.find(x => x.id === arena.agent_b_id)?.name : '-'}</div>
              {(isCreator || isJoiner) && (
                <div className="flex gap-2 items-center">
                  <select className="select" value={myAgent} onChange={e => setMyAgent(e.target.value)} disabled={!((isCreator ? arena.creator_side : arena.joiner_side) && arena.status === 'select_agent')}>
                    <option value="">Select Your Agent</option>
                    {agents.filter(x => x.ownerAccountId === accId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {isCreator && arena.creator_side && arena.status === 'select_agent' && <button className="btn-secondary" onClick={()=>handleSelectAgent(arena.creator_side)}>Set My Agent</button>}
                  {isJoiner && arena.joiner_side && arena.status === 'select_agent' && <button className="btn-secondary" onClick={()=>handleSelectAgent(arena.joiner_side)}>Set My Agent</button>}
                </div>
              )}
            </div>
          )}
          {arena.game_type === 'challenge' && arena.status === 'challenge' && (
            <div className="space-y-2 card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Write Knowledge</div>
                <div className="badge bg-white border text-brand-brown/80">{arena.challenge_minutes} min</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm">Time left</div>
                <div className="text-sm font-mono">{Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,'0')}</div>
              </div>
              <div className="w-full h-2 bg-brand-brown/10 rounded">
                <div className="h-2 bg-blue-500 rounded" style={{ width: `${arena.challenge_minutes ? Math.min(100, Math.max(0, (100*((arena.challenge_minutes*60)-(timeLeft))/(arena.challenge_minutes*60)))) : 0}%` }}></div>
              </div>
              
              {(isCreator || isJoiner) && !youSubmitted ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {myWritingStatus==='idle' && (
                      <button className="btn-outline" onClick={async ()=>{ await challengeControl(arena.id, accId, 'start'); const a = await getArenaById(id as string); setArena(a) }}>Start</button>
                    )}
                    {myWritingStatus==='writing' && (
                      <button className="btn-outline" onClick={async ()=>{ await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText); await challengeControl(arena.id, accId, 'pause'); const a = await getArenaById(id as string); setArena(a) }}>Pause</button>
                    )}
                    {myWritingStatus==='paused' && timeLeft>0 && (
                      <button className="btn-outline" onClick={async ()=>{ await challengeControl(arena.id, accId, 'resume'); const a = await getArenaById(id as string); setArena(a) }}>Resume</button>
                    )}
                  </div>
                  <input className="input" placeholder="Agent Name" value={challengeAgentName} onChange={e => setChallengeAgentName(e.target.value)} />
                  <textarea className="textarea h-40" value={challengeText} onChange={e => setChallengeText(e.target.value)} onPaste={e => e.preventDefault()} onDrop={e => e.preventDefault()} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) { e.preventDefault() } }} placeholder="Type your knowledge manually" disabled={myWritingStatus!=='writing'} />
                  <div className="flex gap-2">
                    <button className="btn-outline" disabled={myWritingStatus!=='writing'} onClick={async ()=>{ await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText); const a = await getArenaById(id as string); setArena(a) }}>Save</button>
                    <button className="btn-secondary" disabled={!mySide || timeLeft<=0 || !challengeAgentName || !(myWritingStatus==='writing' || myWritingStatus==='paused') || !(challengeText && challengeText.length>0)} onClick={async ()=>{
                      try {
                        const u = await submitArenaKnowledge(arena.id, mySide as any, accId, challengeAgentName, challengeText)
                        if (u && !u.error) {
                          setChallengeText('')
                          setChallengeAgentName('')
                          const a = await getArenaById(id as string)
                          setArena(a)
                          setStatus('Submit berhasil')
                        } else {
                          const msg = (u && u.error) ? (typeof u.error === 'string' ? u.error : 'Submit gagal') : 'Submit gagal'
                          setStatus(msg)
                        }
                      } catch (e: any) {
                        setStatus(e?.message || 'Submit gagal')
                      }
                    }}>Submit</button>
                  </div>
                  {(myWritingStatus==='finished' || timeLeft<=0) && (
                    <div className="text-sm text-gray-700">All set — you can’t write anymore</div>
                  )}
                </div>
              ) : (isCreator || isJoiner) && youSubmitted ? (
                <div className="space-y-2">
                  <div className="font-semibold">Your Submitted Knowledge</div>
                  <div className="text-sm">Agent: {youAgentId ? (agents.find(x => x.id === youAgentId)?.name || '-') : '-'}</div>
                  <div className="text-sm whitespace-pre-wrap">
                    {(() => {
                      const ag = agents.find(x => x.id === youAgentId)
                      const texts: string[] = []
                      if (ag && Array.isArray(ag.knowledgePackIds)) {
                        for (const kid of ag.knowledgePackIds) {
                          const p = packs.find((pp: any) => pp.id === kid)
                          if (p && typeof p.content === 'string') texts.push(p.content)
                        }
                      }
                      return texts.length ? texts.join('\n\n---\n') : 'Knowledge unavailable'
                    })()}
                  </div>
                </div>
              ) : (
                <div className="text-sm">Participants only</div>
              )}
            </div>
          )}
          
        </div>
      )}
    </div>
  )
}
