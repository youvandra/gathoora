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
    }
    loadRound()
    let phase: 'pros' | 'cons' = 'pros'
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
          }
        }
      }
    }, 60)
  }

  return (
    <div className="page py-8 space-y-6">
      <h2 className="text-3xl font-bold">Debate Room</h2>
      {!arena ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-3">
          <div className="border p-2">ID: <span className="font-mono">{id}</span></div>
          <div className="border p-2">Code: <span className="font-mono">{arena.code || '-'}</span></div>
          <div className="border p-2">Topic: {arena.topic}</div>
          <div className="border p-2">Status: {arena.status}</div>
          {match && (
            <>
            <div className="card">
              <div className="font-semibold">Conclusion</div>
              <div className="text-sm">{match.judgeConclusion || '-'}</div>
            </div>
            <div className="card">
              {!showScores ? (
                <button className="btn-secondary" onClick={()=>setShowScores(true)}>Reveal Winner & Scores</button>
              ) : (
                <>
                  <div>
                    Winner: {match.winnerAgentId ? (
                      (() => { const wa = agents.find((x: any) => x.id === match.winnerAgentId); return `${wa?.ownerAccountId || '-'} / ${wa?.name || match.winnerAgentId}` })()
                    ) : 'Draw'}
                  </div>
                  <div className="font-semibold">Judge Scores</div>
                  <div className="text-sm">{match.judgeScores?.map((j:any)=>`${j.judgeId}: ${j.agentAScore}-${j.agentBScore}`).join(', ')}</div>
                </>
              )}
            </div>
            </>
          )}
          {arena.status === 'matching' ? (
            <div className="space-y-2 border p-2">Agent still debate</div>
          ) : (
            <div className="space-y-2 border p-2">
              <div className="flex gap-2 flex-wrap">
                <button className="px-3 py-1 border" onClick={()=>startReplay()} disabled={!arena.match_id}>Start Replay All</button>
                <button className="px-3 py-1 border" onClick={()=>startReplay('opening')} disabled={!arena.match_id}>Start Opening</button>
                <button className="px-3 py-1 border" onClick={()=>startReplay('rebuttal')} disabled={!arena.match_id}>Start Rebuttal</button>
                <button className="px-3 py-1 border" onClick={()=>startReplay('crossfire')} disabled={!arena.match_id}>Start Crossfire</button>
                <button className="px-3 py-1 border" onClick={()=>startReplay('closing')} disabled={!arena.match_id}>Start Closing</button>
              </div>
              {currentRound && <div className="text-sm">Round: {currentRound}</div>}
              <div>
                <div className="text-sm font-semibold">Pros</div>
                <div className="whitespace-pre-wrap">{replayPros}</div>
              </div>
              <div>
                <div className="text-sm font-semibold">Cons</div>
                <div className="whitespace-pre-wrap">{replayCons}</div>
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
