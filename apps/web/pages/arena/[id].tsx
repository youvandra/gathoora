import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { listAgents, getArenaById, joinArena, selectArenaAgent, setArenaReady, startArena, deleteArena, submitArenaKnowledge, challengeControl, saveArenaDraft } from '../../lib/api'

export default function ArenaRoom() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const [agents, setAgents] = useState<any[]>([])
  const [arena, setArena] = useState<any | null>(null)
  const [myAgent, setMyAgent] = useState('')
  const [status, setStatus] = useState('')
  const pollingRef = useRef<any>(null)

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null
    if (!acc) { window.location.href = '/'; return }
  }, [])

  useEffect(() => {
    if (!id) return
    listAgents().then(setAgents)
    ;(async () => {
      try {
        const a = await getArenaById(id)
        setArena(a)
      } catch {}
    })()
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try { const a = await getArenaById(id); setArena(a) } catch {}
    }, 2000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [id])

  const accId = typeof window !== 'undefined' ? (localStorage.getItem('accountId') || '') : ''
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
    if (youSubmitted) return
    if (!(myWritingStatus === 'writing' || myWritingStatus === 'paused')) return
    if (timeLeft > 0) return
    if (autoSubmitRef.current) return
    autoSubmitRef.current = true
    ;(async () => {
      try {
        if (mySide && challengeAgentName && challengeText.length >= 50) {
          const u = await submitArenaKnowledge(arena.id, mySide as any, accId, challengeAgentName, challengeText)
          if (u && !u.error) {
            setChallengeText('')
            setChallengeAgentName('')
            const a = await getArenaById(id as string)
            setArena(a)
            setStatus('Auto submit berhasil')
            return
          }
        }
        await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText)
        await challengeControl(arena.id, accId, 'finish')
        const a = await getArenaById(id as string)
        setArena(a)
        setStatus(challengeText.length < 50 ? 'Waktu habis. Draft disimpan (kurang 50)' : 'Auto submit gagal')
      } catch (e: any) {
        setStatus(e?.message || 'Auto submit gagal')
      }
    })()
  }, [timeLeft, arena?.status, youSubmitted, myWritingStatus, mySide, challengeAgentName, challengeText, accId, id])

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
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Arena Room</h2>
      {status && <div className={`text-sm ${/berhasil|sukses/i.test(status) ? 'text-green-600' : 'text-red-600'}`}>{status}</div>}
      {!arena ? (
        <div>Loading...</div>
      ) : (
          <div className="space-y-3">
            <div className="border p-2">ID: <span className="font-mono">{id}</span></div>
            <div className="border p-2">Code: <span className="font-mono">{arena.code || '-'}</span></div>
            <div className="border p-2">Topic: {arena.topic}</div>
            <div className="border p-2">Type: {arena.game_type}</div>
            <div className="border p-2">Status: {arena.status}</div>
            <div className="border p-2">Participants: You {(isCreator || isJoiner) ? (isCreator ? (arena.creator_account_id || '-') : (arena.joiner_account_id || '-')) : '-'} | Opponent {isCreator ? (arena.joiner_account_id || '-') : (arena.creator_account_id || '-')}</div>
            <div className="border p-2">Sides: You {mySide || '-'} | Opponent {isCreator ? (arena.joiner_side || '-') : (arena.creator_side || '-')}</div>
          {!arena.joiner_account_id && !isCreator && (
            <button className="px-3 py-1 border" onClick={handleJoin}>Join Room</button>
          )}
          {arena.game_type !== 'challenge' && (
            <div className="space-y-2 border p-2">
              <div>Agents: Pros {arena.agent_a_id ? agents.find(x => x.id === arena.agent_a_id)?.name : '-'} | Cons {arena.agent_b_id ? agents.find(x => x.id === arena.agent_b_id)?.name : '-'}</div>
              {(isCreator || isJoiner) && (
                <div className="flex gap-2 items-center">
                  <select className="border p-2" value={myAgent} onChange={e => setMyAgent(e.target.value)} disabled={!((isCreator ? arena.creator_side : arena.joiner_side) && arena.status === 'select_agent')}>
                    <option value="">Select Your Agent</option>
                    {agents.filter(x => x.ownerAccountId === accId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {isCreator && arena.creator_side && arena.status === 'select_agent' && <button className="px-3 py-1 border" onClick={()=>handleSelectAgent(arena.creator_side)}>Set My Agent</button>}
                  {isJoiner && arena.joiner_side && arena.status === 'select_agent' && <button className="px-3 py-1 border" onClick={()=>handleSelectAgent(arena.joiner_side)}>Set My Agent</button>}
                </div>
              )}
            </div>
          )}
          {arena.game_type === 'challenge' && arena.status === 'challenge' && (
            <div className="space-y-2 border p-2">
              <div className="font-semibold">Write Knowledge ({arena.challenge_minutes} min)</div>
              <div className="text-sm">Time left: {Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,'0')}</div>
              <div className="text-sm">Submitted: You {youSubmitted ? '✅' : '❌'} | Opponent {oppSubmitted ? '✅' : '❌'}</div>
              <div className="text-sm">Agents: You {youAgentId ? (agents.find(x => x.id === youAgentId)?.name || '-') : '-'} | Opponent {oppAgentId ? (agents.find(x => x.id === oppAgentId)?.name || '-') : '-'}</div>
              {(isCreator || isJoiner) ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button className="px-3 py-1 border" disabled={myWritingStatus!=='idle'} onClick={async ()=>{ await challengeControl(arena.id, accId, 'start'); const a = await getArenaById(id as string); setArena(a) }}>Start</button>
                    <button className="px-3 py-1 border" disabled={myWritingStatus!=='writing'} onClick={async ()=>{ await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText); await challengeControl(arena.id, accId, 'pause'); const a = await getArenaById(id as string); setArena(a) }}>Pause</button>
                    <button className="px-3 py-1 border" disabled={myWritingStatus!=='paused' || timeLeft<=0} onClick={async ()=>{ await challengeControl(arena.id, accId, 'resume'); const a = await getArenaById(id as string); setArena(a) }}>Resume</button>
                  </div>
                  <input className="w-full border p-2" placeholder="Agent Name" value={challengeAgentName} onChange={e => setChallengeAgentName(e.target.value)} />
                  <textarea className="w-full border p-2 h-40" value={challengeText} onChange={e => setChallengeText(e.target.value)} onPaste={e => e.preventDefault()} onDrop={e => e.preventDefault()} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) { e.preventDefault() } }} placeholder="Type your knowledge manually" disabled={myWritingStatus!=='writing'} />
                  <div className="flex gap-2">
                    <button className="px-3 py-1 border" disabled={myWritingStatus!=='writing'} onClick={async ()=>{ await saveArenaDraft(arena.id, accId, challengeAgentName, challengeText); const a = await getArenaById(id as string); setArena(a) }}>Save</button>
                  </div>
                  <button className="px-3 py-1 border" disabled={!mySide || timeLeft<=0 || challengeText.length < 50 || !challengeAgentName || !(myWritingStatus==='writing' || myWritingStatus==='paused')} onClick={async ()=>{
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
                  {(myWritingStatus==='finished' || timeLeft<=0) && (
                    <div className="text-sm text-gray-700">All set — you can’t write anymore</div>
                  )}
                </div>
              ) : (
                <div className="text-sm">Participants only</div>
              )}
            </div>
          )}
          
            <div className="space-y-2 border p-2">
            <div>Ready: You {youReady ? '✅' : '❌'} | Opponent {oppReady ? '✅' : '❌'}</div>
            <div className="flex gap-2">
              {isCreator && <button className="px-3 py-1 border" disabled={arena.status === 'completed'} onClick={()=>handleReady('creator')}>Ready</button>}
              {isJoiner && <button className="px-3 py-1 border" disabled={arena.status === 'completed'} onClick={()=>handleReady('joiner')}>Ready</button>}
              <button className="px-3 py-1 border" disabled={!(isCreator && !arena.match_id && ((arena.game_type !== 'challenge' && arena.status === 'select_agent' && arena.agent_a_id && arena.agent_b_id && arena.creator_ready && arena.joiner_ready) || (arena.game_type === 'challenge' && arena.status === 'challenge' && arena.agent_a_id && arena.agent_b_id && arena.creator_knowledge_submitted && arena.joiner_knowledge_submitted)))} onClick={handleStart}>Start Debate</button>
              {(arena.status === 'completed' || arena.status === 'matching') && (
                <a className="px-3 py-1 border" href={`/arena/${id}/debateroom`}>Debate Room</a>
              )}
          </div>
        </div>
          
        </div>
      )}
    </div>
  )
}
