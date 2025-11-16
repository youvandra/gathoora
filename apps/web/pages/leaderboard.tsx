import { useEffect, useMemo, useState } from 'react'
import { listLeaderboardAccounts } from '../lib/api'

export default function Leaderboard() {
  const [rows, setRows] = useState<any[]>([])
  const [sortKey, setSortKey] = useState<'rank'|'account'|'agents'|'elo'>('elo')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [minAgents, setMinAgents] = useState<number>(0)
  const [timeframe, setTimeframe] = useState<'all'|'week'>('all')

  useEffect(() => {
    listLeaderboardAccounts().then(xs => setRows(xs))
  }, [])

  const sorted = useMemo(() => {
    const base = rows.filter(r => r.agentCount >= minAgents)
    const cmp = (a: any, b: any) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'elo') return (a.elo - b.elo) * dir
      if (sortKey === 'agents') return (a.agentCount - b.agentCount) * dir
      if (sortKey === 'account') return String(a.accountId).localeCompare(String(b.accountId)) * dir
      return 0
    }
    const pinned = [...rows].sort((a: any, b: any) => b.elo - a.elo).slice(0, 3)
    const restBase = base.filter(x => !pinned.some(p => p.accountId === x.accountId))
    const rest = [...restBase].sort(cmp)
    return [...pinned, ...rest]
  }, [rows, sortKey, sortDir, minAgents])

  function toggleSort(key: 'rank'|'account'|'agents'|'elo') {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'account' ? 'asc' : 'desc') }
  }

  function truncateAcc(id: string) {
    if (!id) return '-'
    return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id
  }

  async function copyAcc(id: string) {
    try { await navigator.clipboard.writeText(id) } catch {}
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Leaderboard</h2>
          <div className="text-sm text-brand-brown/70">Top users sorted by ELO performance across all matches.</div>
        </div>
        <div className="flex items-center gap-2">
          <select className="select w-40" value={timeframe} onChange={e=>setTimeframe(e.target.value as any)}>
            <option value="all">All time</option>
            <option value="week">This week</option>
          </select>
          <div className="flex items-center gap-2">
            <span className="label">Min agents</span>
            <select className="select w-24" value={minAgents} onChange={e=>setMinAgents(Number(e.target.value))}>
              {[0,1,2,3,5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Top agents this week</div>
        </div>
        <table className="table table-zebra">
          <thead>
            <tr className="text-left">
              <th className="p-2 w-24">Rank</th>
              <th className="p-2 cursor-pointer" onClick={()=>toggleSort('account')}>Account ID {sortKey==='account' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th className="p-2 w-32 cursor-pointer" onClick={()=>toggleSort('agents')}>Agents {sortKey==='agents' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th className="p-2 w-40 cursor-pointer" onClick={()=>toggleSort('elo')}>ELO Rating {sortKey==='elo' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const rank = i + 1
              const medal = rank===1 ? '🥇' : rank===2 ? '🥈' : rank===3 ? '🥉' : ''
              const tint = rank===1 ? 'bg-brand-yellow/20' : rank===2 ? 'bg-brand-cream/60' : rank===3 ? 'bg-brand-peach/30' : ''
              return (
                <tr key={row.accountId} className={`${tint}`}>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-6 rounded bg-brand-coral" aria-hidden></div>
                      <div className="text-base font-semibold">{medal || `#${rank}`}</div>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="truncate max-w-xs" title={row.accountId}>
                        {truncateAcc(row.accountId)}
                      </div>
                    </div>
                  </td>
                  <td className="p-2 text-sm">{row.agentCount}</td>
                  <td className="p-2">
                    <span className="badge">{row.elo}</span>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6">
                  <div className="text-sm text-brand-brown/60">No leaderboard entries</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
