import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { listAgents, getArenaById, joinArena, selectArenaAgent, setArenaReady, startArena, deleteArena, submitArenaKnowledge, challengeControl, saveArenaDraft, getMatch, listKnowledgePacks, cancelArena } from '../../lib/api'

export default function ArenaRoom() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const [agents, setAgents] = useState<any[]>([])
  const [arena, setArena] = useState<any | null>(null)
  const [myAgent, setMyAgent] = useState('')
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: 'success'|'error'|'info' }[]>([])
  const [match, setMatch] = useState<any | null>(null)
  const [packs, setPacks] = useState<any[]>([])
  const pollingRef = useRef<any>(null)

  function pushToast(text: string, kind: 'success'|'error'|'info' = 'info') {
    const tid = `${Date.now()}-${Math.random()}`
    setToasts(t => [...t, { id: tid, text, kind }])
    setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 4000)
  }

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
  const myDraftText = isCreator ? arena?.creator_draft_text : (isJoiner ? arena?.joiner_draft_text : '')
  const oppDraftText = isCreator ? arena?.joiner_draft_text : arena?.creator_draft_text
  const MIN_WORDS = 50
  const countWords = (txt?: string) => String(txt||'').trim().split(/\s+/).filter(Boolean).length
  const isTextSufficient = (txt?: string) => countWords(txt) >= MIN_WORDS
  const countChars = (txt?: string) => String(txt||'').length
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const autoSubmitRef = useRef<boolean>(false)
  const [oppTimeLeft, setOppTimeLeft] = useState<number>(0)
  const autoOppCheckRef = useRef<boolean>(false)
  const lastSavedRef = useRef<{ name: string; text: string }>({ name: '', text: '' })
  const submitDisabled = !mySide || timeLeft<=0 || !challengeAgentName || !(myWritingStatus==='writing' || myWritingStatus==='paused') || !isTextSufficient(challengeText)
  const canStart = !!arena && !arena.match_id && (
    (arena.game_type !== 'challenge' && arena.status === 'select_agent' && arena.agent_a_id && arena.agent_b_id && arena.creator_ready && arena.joiner_ready) ||
    (arena.game_type === 'challenge' && arena.status === 'challenge' && arena.agent_a_id && arena.agent_b_id && arena.creator_knowledge_submitted && arena.joiner_knowledge_submitted)
  )
  useEffect(() => {
    if (!arena || arena.status !== 'challenge') return
    if (!(isCreator || isJoiner)) return
    if (myWritingStatus !== 'writing') return
    if (timeLeft <= 0) return
    const nameNow = challengeAgentName || ''
    const textNow = challengeText || ''
    if (!nameNow && !textNow) return
    const changed = nameNow !== lastSavedRef.current.name || textNow !== lastSavedRef.current.text
    if (!changed) return
    const t = setTimeout(async () => {
      try {
        await saveArenaDraft(arena.id, accId, nameNow, textNow)
        lastSavedRef.current = { name: nameNow, text: textNow }
      } catch {}
    }, 600)
    return () => clearTimeout(t)
  }, [arena?.status, isCreator, isJoiner, myWritingStatus, timeLeft, challengeAgentName, challengeText])
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
    if (!myWritingStartedAt) return
    const totalSecs = (arena.challenge_minutes || 0) * 60
    const elapsedSecs = Math.floor((Date.now() - new Date(myWritingStartedAt).getTime()) / 1000) - (myPausedSecs || 0)
    const leftNow = Math.max(0, totalSecs - Math.max(0, elapsedSecs))
    if (leftNow > 0) return
    if (autoSubmitRef.current) return
    autoSubmitRef.current = true
    ;(async () => {
      try {
        if ((isCreator || isJoiner) && !youSubmitted) {
          try {
            if (!myWritingStartedAt) {
              await challengeControl(arena.id, accId, 'start')
            }
            const currText = challengeText || myDraftText || ''
            const agentNameAuto = challengeAgentName || (isCreator ? (arena?.creator_draft_agent_name || '') : (isJoiner ? (arena?.joiner_draft_agent_name || '') : '')) || 'Auto Agent'
            if (currText && mySide && isTextSufficient(currText)) {
              await saveArenaDraft(arena.id, accId, agentNameAuto, currText)
              const u = await submitArenaKnowledge(arena.id, mySide as any, accId, agentNameAuto, currText)
              if (u && !u.error) {
                const a0 = await getArenaById(id as string)
                setArena(a0)
                pushToast('Auto submit berhasil', 'success')
              }
            }
          } catch {}
        }
        const myInsufficient = !youSubmitted && !isTextSufficient(myDraftText || challengeText || '')
        const someoneStarted = !!myWritingStartedAt || !!(isCreator ? arena?.joiner_writing_started_at : arena?.creator_writing_started_at)
        const bothInsufficientAndNoStart = !someoneStarted && (!youSubmitted && !isTextSufficient(myDraftText || challengeText || '')) && (!oppSubmitted && !isTextSufficient(oppDraftText || ''))
        if (myInsufficient || bothInsufficientAndNoStart) {
          await cancelArena(arena.id, 'Time over')
          const a = await getArenaById(id as string)
          setArena(a)
          pushToast('Waktu habis. Arena dibatalkan', 'error')
          return
        }
      } catch (e: any) {
        pushToast(e?.message || 'Gagal membatalkan arena', 'error')
      }
    })()
  }, [timeLeft, arena?.status, arena?.creator_knowledge_submitted, arena?.joiner_knowledge_submitted, id, myWritingStartedAt, youSubmitted])

  useEffect(() => {
    if (!arena || arena.status !== 'challenge') return
    const oppWritingStatus: 'idle'|'writing'|'paused'|'finished'|undefined = isCreator ? arena?.joiner_writing_status : arena?.creator_writing_status
    const oppWritingStartedAt: string | undefined = isCreator ? arena?.joiner_writing_started_at : arena?.creator_writing_started_at
    const oppPausedSecs: number = isCreator ? (arena?.joiner_paused_secs || 0) : (arena?.creator_paused_secs || 0)
    const oppPausedAt: string | undefined = isCreator ? arena?.joiner_paused_at : arena?.creator_paused_at
    if (!oppWritingStartedAt) { setOppTimeLeft(arena.challenge_minutes * 60); return }
    const total = arena.challenge_minutes * 60
    const computeRunning = () => {
      const elapsed = Math.floor((Date.now() - new Date(oppWritingStartedAt).getTime()) / 1000) - (oppPausedSecs || 0)
      const secs = Math.max(0, total - Math.max(0, elapsed))
      setOppTimeLeft(secs)
    }
    const computePaused = () => {
      const pausedAtTs = oppPausedAt ? new Date(oppPausedAt).getTime() : Date.now()
      const elapsed = Math.floor((pausedAtTs - new Date(oppWritingStartedAt).getTime()) / 1000) - (oppPausedSecs || 0)
      const secs = Math.max(0, total - Math.max(0, elapsed))
      setOppTimeLeft(secs)
    }
    if (oppWritingStatus === 'writing') {
      computeRunning()
      const int = setInterval(computeRunning, 1000)
      return () => clearInterval(int)
    } else {
      computePaused()
    }
  }, [arena?.challenge_minutes, arena?.status, isCreator ? arena?.joiner_writing_started_at : arena?.creator_writing_started_at, isCreator ? arena?.joiner_writing_status : arena?.creator_writing_status, isCreator ? arena?.joiner_paused_secs : arena?.creator_paused_secs, isCreator ? arena?.joiner_paused_at : arena?.creator_paused_at])

  useEffect(() => {
    if (!arena || arena.status !== 'challenge') return
    if (autoOppCheckRef.current) return
    const oppWritingStartedAt: string | undefined = isCreator ? arena?.joiner_writing_started_at : arena?.creator_writing_started_at
    if (!oppWritingStartedAt) return
    const totalSecs = (arena.challenge_minutes || 0) * 60
    const oppPaused = isCreator ? (arena?.joiner_paused_secs || 0) : (arena?.creator_paused_secs || 0)
    const oppElapsed = Math.floor((Date.now() - new Date(oppWritingStartedAt).getTime()) / 1000) - (oppPaused || 0)
    const oppLeftNow = Math.max(0, totalSecs - Math.max(0, oppElapsed))
    if (oppLeftNow > 0) return
    autoOppCheckRef.current = true
    ;(async () => {
      try {
        const oppInsufficient = !oppSubmitted && !isTextSufficient(oppDraftText || '')
        if (oppInsufficient) {
          await cancelArena(arena.id, 'Time over')
          const a = await getArenaById(id as string)
          setArena(a)
          pushToast('Waktu habis. Arena dibatalkan', 'error')
        }
      } catch (e: any) {
        pushToast(e?.message || 'Gagal membatalkan arena', 'error')
      }
    })()
  }, [oppTimeLeft, arena?.status, oppDraftText, id, isCreator ? arena?.joiner_writing_started_at : arena?.creator_writing_started_at, oppSubmitted])

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
      pushToast(e?.message || 'Join failed', 'error')
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
      pushToast(e?.message || 'Failed to start', 'error')
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
              <button className="btn-ghost btn-sm btn-compact" onClick={async ()=>{ try { await navigator.clipboard.writeText(String(arena.code)) } catch {}; pushToast('Code copied', 'success') }}>
                Copy
              </button>
            )}
          </div>
        </div>
        {arena && (
          <div className="flex items-start gap-2">
            <span className="badge bg-white border text-brand-brown/80">{arena.game_type === 'challenge' ? 'Challenge' : 'Import'}</span>
            <div className="flex flex-col">
              <span className={`badge ${String(arena.status||'').toLowerCase() === 'completed' ? 'bg-green-100 text-green-800' : String(arena.status||'').toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800' : String(arena.status||'').toLowerCase() === 'matching' ? 'bg-blue-100 text-blue-800' : String(arena.status||'').toLowerCase() === 'waiting' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{arena.status}</span>
            </div>
          </div>
        )}
      </div>
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={t.kind==='success' ? 'toast-success' : t.kind==='error' ? 'toast-error' : 'toast'}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">{t.text}</div>
              <button className="btn-ghost btn-sm" onClick={()=> setToasts(ts => ts.filter(x => x.id !== t.id))}>Close</button>
            </div>
          </div>
        ))}
      </div>
      {!arena ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-4">
          <div className="card p-6">
            <div className="text-sm text-brand-brown/60">Topic</div>
            <div className="text-xl font-semibold">{arena.topic}</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">You</div>
                  <span className={`badge ${youReady ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{youReady ? 'Ready' : 'Not ready'}</span>
                </div>
                <div className="text-xs text-brand-brown/60 font-mono truncate">{(isCreator || isJoiner) ? (isCreator ? (arena.creator_account_id || '-') : (arena.joiner_account_id || '-')) : '-'}</div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-brand-brown/60">Side</div>
                  <span className={`badge ${mySide==='pros' ? 'bg-green-100 text-green-800' : mySide==='cons' ? 'bg-rose-100 text-rose-800' : 'bg-white border text-brand-brown/80'}`}>{mySide || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-brand-brown/60">Submitted</div>
                  <span className="badge bg-white border text-brand-brown/80">{youSubmitted ? '✅' : '❌'}</span>
                </div>
              </div>
              <div className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Opponent</div>
                  <span className={`badge ${oppReady ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{oppReady ? 'Ready' : 'Not ready'}</span>
                </div>
                <div className="text-xs text-brand-brown/60 font-mono truncate">{isCreator ? (arena.joiner_account_id || '-') : (arena.creator_account_id || '-')}</div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-brand-brown/60">Side</div>
                  <span className={`badge ${(isCreator ? arena.joiner_side : arena.creator_side)==='pros' ? 'bg-green-100 text-green-800' : (isCreator ? arena.joiner_side : arena.creator_side)==='cons' ? 'bg-rose-100 text-rose-800' : 'bg-white border text-brand-brown/80'}`}>{(isCreator ? (arena.joiner_side || '-') : (arena.creator_side || '-'))}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-brand-brown/60">Submitted</div>
                  <span className="badge bg-white border text-brand-brown/80">{oppSubmitted ? '✅' : '❌'}</span>
                </div>
              </div>
            </div>
            {(String(arena.status||'').toLowerCase() === 'waiting') && (
              <div className="mt-3 flex flex-wrap gap-2">
                {isCreator && <button className={`btn-outline ${youReady ? 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed hover:bg-gray-200' : ''}`} onClick={()=>handleReady('creator')} disabled={youReady}>Ready</button>}
                {isJoiner && <button className={`btn-outline ${youReady ? 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed hover:bg-gray-200' : ''}`} onClick={()=>handleReady('joiner')} disabled={youReady}>Ready</button>}
              </div>
            )}
            {false}
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
                  <input className="input" placeholder="Agent Name" value={challengeAgentName} onChange={e => setChallengeAgentName(e.target.value)} disabled={myWritingStatus!=='writing' || timeLeft<=0} />
                  <textarea className="textarea h-40" value={challengeText} onChange={e => setChallengeText(e.target.value)} onPaste={e => e.preventDefault()} onDrop={e => e.preventDefault()} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) { e.preventDefault() } }} placeholder="Type your knowledge manually" disabled={myWritingStatus!=='writing' || timeLeft<=0} />
                  <div className="text-xs text-brand-brown/60 flex items-center gap-2">
                    <span>Characters {countChars(challengeText)}</span>
                    <span>Words {countWords(challengeText)}</span>
                    <span className={`badge ${isTextSufficient(challengeText) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{isTextSufficient(challengeText) ? 'Cukup' : 'Belum cukup'}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className={`btn-secondary ${submitDisabled ? 'bg-gray-200 text-gray-500 hover:bg-gray-200 cursor-not-allowed' : ''}`} disabled={submitDisabled} onClick={async ()=>{
                      try {
                        try {
                          if (myWritingStatus==='paused') {
                            await challengeControl(arena.id, accId, 'resume')
                          }
                          if (!myWritingStartedAt || !(myWritingStatus==='writing' || myWritingStatus==='paused')) {
                            await challengeControl(arena.id, accId, 'start')
                            await new Promise(r=>setTimeout(r, 200))
                          }
                        } catch {}
                        await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText)
                        const u = await submitArenaKnowledge(arena.id, mySide as any, accId, challengeAgentName, challengeText)
                        if (u && !u.error) {
                          setChallengeText('')
                          setChallengeAgentName('')
                          const a = await getArenaById(id as string)
                          setArena(a)
                          pushToast('Submit berhasil', 'success')
                        } else {
                          const errStr = (u && typeof u.error === 'string') ? u.error : ((u && u.error && typeof u.error === 'object' && (u.error.message || u.error.code)) || '')
                          if (/not started/i.test(errStr)) {
                            try {
                              await challengeControl(arena.id, accId, 'start')
                              await new Promise(r=>setTimeout(r, 300))
                              const a1 = await getArenaById(id as string)
                              setArena(a1)
                              await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText)
                              const u2 = await submitArenaKnowledge(arena.id, mySide as any, accId, challengeAgentName, challengeText)
                              if (u2 && !u2.error) {
                                setChallengeText('')
                                setChallengeAgentName('')
                                const a = await getArenaById(id as string)
                                setArena(a)
                                pushToast('Submit berhasil', 'success')
                                return
                              }
                            } catch {}
                          }
                          if (/time\s*over|expired/i.test(errStr)) {
                            try {
                              const aNow = await getArenaById(id as string)
                              setArena(aNow)
                              const startedAt = isCreator ? aNow?.creator_writing_started_at : aNow?.joiner_writing_started_at
                              const pausedSecs = isCreator ? (aNow?.creator_paused_secs || 0) : (aNow?.joiner_paused_secs || 0)
                              const statusNow = isCreator ? aNow?.creator_writing_status : aNow?.joiner_writing_status
                              const total = (aNow?.challenge_minutes || 0) * 60
                              const elapsed = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime())/1000) - pausedSecs : 0
                              const left = Math.max(0, total - Math.max(0, elapsed))
                              if (left > 0) {
                                if (statusNow==='paused') {
                                  await challengeControl(arena.id, accId, 'resume')
                                }
                                await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText)
                                const u3 = await submitArenaKnowledge(arena.id, mySide as any, accId, challengeAgentName, challengeText)
                                if (u3 && !u3.error) {
                                  setChallengeText('')
                                  setChallengeAgentName('')
                                  const a = await getArenaById(id as string)
                                  setArena(a)
                                  pushToast('Submit berhasil', 'success')
                                  return
                                }
                              } else {
                                pushToast('Waktu habis', 'error')
                              }
                            } catch {}
                          }
                          const msg = errStr || 'Submit gagal'
                          pushToast(msg, 'error')
                        }
                      } catch (e: any) {
                        pushToast(e?.message || 'Submit gagal', 'error')
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
          
          {arena && canStart && (
            <div className="mt-6 flex justify-end">
              {isCreator && (
                <button className="btn-primary" onClick={handleStart}>Start Debate</button>
              )}
              {isJoiner && (
                <span className="badge bg-white border text-brand-brown/80">Waiting for start</span>
              )}
            </div>
          )}
          
        </div>
      )}
    </div>
  )
}
