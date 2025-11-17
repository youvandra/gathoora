import { useEffect, useMemo, useState } from 'react'
import { listLeaderboardAccounts } from '../lib/api'
import { supabase } from '../lib/supabase'

export default function Leaderboard() {
  const [rows, setRows] = useState<any[]>([])
  const [sortKey, setSortKey] = useState<'rank'|'account'|'agents'|'elo'>('elo')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [minAgents, setMinAgents] = useState<number>(0)
  const [timeframe, setTimeframe] = useState<'all'|'week'>('all')

  useEffect(() => {
    ;(async () => {
      const xs = await listLeaderboardAccounts()
      try {
        const ids = xs.map((x: any) => String(x.accountId)).filter(Boolean)
        if (ids.length > 0) {
          const { data } = await supabase.from('users').select('account_id,name').in('account_id', ids)
          const map: Record<string, string> = {}
          ;(data || []).forEach((u: any) => { map[String(u.account_id)] = String( u.name || '') })
          const withNames = xs.map((x: any) => ({ ...x, displayName: map[String(x.accountId)] || '' }))
          setRows(withNames)
          return
        }
      } catch {}
      setRows(xs)
    })()
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
    <div className="page py-8 space-y-6">
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
          <div className="font-semibold">Top agents</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full">
          <thead>
            <tr className="text-left">
              <th className="p-2 w-24">Rank</th>
              <th className="p-2 pr-1 w-40">Name</th>
              <th className="p-2 pl-1 cursor-pointer" onClick={()=>toggleSort('account')}>Account ID {sortKey==='account' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
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
                  <td className="p-2 pr-1">
                    <div className="truncate max-w-xs text-sm text-brand-brown/80" title={row.displayName || ''}>
                      {row.displayName || '-'}
                    </div>
                  </td>
                  <td className="p-2 pl-1">
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
                <td colSpan={5} className="p-6">
                  <div className="text-sm text-brand-brown/60">No leaderboard entries</div>
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
