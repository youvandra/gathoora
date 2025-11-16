import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { getArenaById, getMatch, listAgents } from '../../../lib/api'

export default function ArenaDebateRoom() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const [arena, setArena] = useState<any | null>(null)
  const [currentRound, setCurrentRound] = useState<string>('')
  const [replayPros, setReplayPros] = useState('')
  const [replayCons, setReplayCons] = useState('')
  const [replayScores, setReplayScores] = useState<any | null>(null)
  const replayRef = useRef<any>(null)
  const [match, setMatch] = useState<any | null>(null)
  const [showScores, setShowScores] = useState(false)
  const [agents, setAgents] = useState<any[]>([])
  const [isReplaying, setIsReplaying] = useState(false)
  const [replayPct, setReplayPct] = useState(0)
  const [revealProgress, setRevealProgress] = useState(0)
  const revealTimerRef = useRef<any>(null)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const a = await getArenaById(id)
      setArena(a)
      if (a?.match_id) {
        const m = await getMatch(a.match_id)
        setMatch(m)
        setReplayScores(m.judgeScores)
      }
      const xs = await listAgents()
      setAgents(xs)
    })()
    return () => { if (replayRef.current) clearInterval(replayRef.current) }
  }, [id])

  async function startReplay(round?: string) {
    if (!arena?.match_id) return
    const m = await getMatch(arena.match_id)
    const order = round ? [round] : ['opening','rebuttal','crossfire','closing']
    setReplayPros('')
    setReplayCons('')
    setReplayScores(m.judgeScores)
    if (replayRef.current) clearInterval(replayRef.current)
    let ri = 0
    let prosChunks: string[] = []
    let consChunks: string[] = []
    let pi = 0
    let ci = 0
    function loadRound() {
      const r = order[ri]
      setCurrentRound(r)
      const pros = m.rounds.find((x: any) => x.round === r && x.agentId === m.agentAId)?.text || ''
      const cons = m.rounds.find((x: any) => x.round === r && x.agentId === m.agentBId)?.text || ''
      prosChunks = chunkText(pros)
      consChunks = chunkText(cons)
      pi = 0
      ci = 0
      setReplayPct(0)
    }
    loadRound()
    let phase: 'pros' | 'cons' = 'pros'
    setIsReplaying(true)
    replayRef.current = setInterval(() => {
      if (phase === 'pros') {
        const p = prosChunks[pi]
        if (p) {
          setReplayPros(prev => prev + p)
          pi++
        }
        if (pi >= prosChunks.length) {
          phase = 'cons'
        }
      } else {
        const c = consChunks[ci]
        if (c) {
          setReplayCons(prev => prev + c)
          ci++
        }
        if (ci >= consChunks.length) {
          if (ri < order.length - 1) {
            ri++
            setReplayPros(prev => prev + '\n')
            setReplayCons(prev => prev + '\n')
            loadRound()
            phase = 'pros'
          } else {
            clearInterval(replayRef.current)
            setIsReplaying(false)
            setReplayPct(100)
          }
        }
      }
      const totalParts = (prosChunks.length || 1) + (consChunks.length || 1)
      const doneParts = Math.min(pi, prosChunks.length) + Math.min(ci, consChunks.length)
      setReplayPct(Math.min(100, Math.floor((doneParts / Math.max(1, totalParts)) * 100)))
    }, 60)
  }

  function stopReplay() {
    if (replayRef.current) clearInterval(replayRef.current)
    setIsReplaying(false)
  }

  function startHoldReveal() {
    if (revealTimerRef.current) clearInterval(revealTimerRef.current)
    setRevealing(true)
    const start = Date.now()
    revealTimerRef.current = setInterval(() => {
      const pct = Math.min(100, Math.floor(((Date.now() - start) / 800) * 100))
      setRevealProgress(pct)
    }, 16)
  }

  function endHoldReveal() {
    if (revealTimerRef.current) clearInterval(revealTimerRef.current)
    if (revealProgress >= 100) {
      setShowScores(true)
    }
    setRevealing(false)
    setRevealProgress(0)
  }

  return (
    <div className="page py-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Debate Room</h2>
      </div>
      {!arena ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="font-semibold">Topic</div>
            <div className="text-lg font-semibold mt-1">{arena.topic}</div>
          </div>
          {match && (
            <>
            <div className="card p-4">
              {!showScores ? (
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Winner & Scores</div>
                  <button className={`btn-secondary btn-sm relative overflow-hidden`} onMouseDown={startHoldReveal} onMouseUp={endHoldReveal} onMouseLeave={endHoldReveal} onTouchStart={startHoldReveal} onTouchEnd={endHoldReveal}>
                    <span>Hold to Reveal</span>
                    <span className="absolute left-0 top-0 h-full bg-brand-peach" style={{ width: `${revealProgress}%`, opacity: revealing ? 0.4 : 0 }}></span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const winId = match.winnerAgentId
                    const aName = agents.find((x: any) => x.id === match.agentAId)?.name || 'Agent A'
                    const bName = agents.find((x: any) => x.id === match.agentBId)?.name || 'Agent B'
                    const winSide = winId ? (winId === match.agentAId ? 'A' : 'B') : undefined
                    const winName = winId ? (winSide === 'A' ? aName : bName) : 'Draw'
                    const avgA = (match.judgeScores||[]).reduce((s: number, j: any)=> s + (j.agentAScore||0), 0)/Math.max(1,(match.judgeScores||[]).length)
                    const avgB = (match.judgeScores||[]).reduce((s: number, j: any)=> s + (j.agentBScore||0), 0)/Math.max(1,(match.judgeScores||[]).length)
                    const avgAPct = Math.round((avgA||0)*100)
                    const avgBPct = Math.round((avgB||0)*100)
                    return (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`badge ${winId ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'} text-sm`}>{winId ? '🏆' : '⚖️'}</span>
                          <div className="text-xl font-bold">{winName} {winId ? (winSide==='A'?'(A)':'(B)') : ''}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="card px-3 py-2">
                            <div className="text-xs text-brand-brown/60">Average A</div>
                            <div className="text-lg font-semibold">{avgAPct}%</div>
                          </div>
                          <div className="card px-3 py-2">
                            <div className="text-xs text-brand-brown/60">Average B</div>
                            <div className="text-lg font-semibold">{avgBPct}%</div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  <div className="space-y-2">
                    <div className="text-sm text-brand-brown/60">Judge Scores</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(match.judgeScores||[]).map((j: any) => {
                        const aWin = (j.agentAScore||0) >= (j.agentBScore||0)
                        const aPct = Math.round((j.agentAScore||0)*100)
                        const bPct = Math.round((j.agentBScore||0)*100)
                        return (
                          <div key={j.judgeId} className="card p-3 flex items-center justify-between">
                            <div className="text-xs text-brand-brown/60">{j.judgeId}</div>
                            <div className="flex items-center gap-3">
                              <span className={`badge ${aWin ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>A {aPct}%</span>
                              <span className={`badge ${!aWin ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-800'}`}>B {bPct}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="card p-4">
              <div className="font-semibold">Conclusion</div>
              <div className="mt-2 space-y-2">
                <div className="text-sm">{match.judgeConclusion || '-'}</div>
                {(() => {
                  const txt = String(match.judgeConclusion||'')
                  const parts = txt.split(/[\.\n]+/).map(s=>s.trim()).filter(Boolean)
                  return parts.length>1 ? (
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {parts.map((p, i)=>(<li key={i}>{p}</li>))}
                    </ul>
                  ) : null
                })()}
              </div>
            </div>
            </>
          )}
          {arena.status === 'matching' ? (
            <div className="card p-4">Agent still debate</div>
          ) : (
            <div className="space-y-3">
              <div className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button className={`btn-page ${!arena?.match_id ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''}`} onClick={()=>startReplay()} disabled={!arena?.match_id}>All</button>
                  <button className={`btn-page ${!arena?.match_id ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''}`} onClick={()=>startReplay('opening')} disabled={!arena?.match_id}>Opening</button>
                  <button className={`btn-page ${!arena?.match_id ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''}`} onClick={()=>startReplay('rebuttal')} disabled={!arena?.match_id}>Rebuttal</button>
                  <button className={`btn-page ${!arena?.match_id ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''}`} onClick={()=>startReplay('crossfire')} disabled={!arena?.match_id}>Crossfire</button>
                  <button className={`btn-page ${!arena?.match_id ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''}`} onClick={()=>startReplay('closing')} disabled={!arena?.match_id}>Closing</button>
                {false}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-sm">Round</div>
                    <span className="badge bg-white border text-brand-brown/80">{currentRound || '-'}</span>
                  </div>
                  <div className="w-48 h-2 bg-brand-brown/10 rounded">
                    <div className="h-2 bg-brand-blue rounded" style={{ width: `${replayPct}%` }}></div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card p-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">Pros</div>
                    <span className="badge bg-green-100 text-green-800">A</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap">{replayPros}</div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">Cons</div>
                    <span className="badge bg-rose-100 text-rose-800">B</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap">{replayCons}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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
