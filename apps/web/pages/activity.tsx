import { useEffect, useMemo, useState } from 'react'
import { listActivities, listKnowledgePacks, getMarketplaceListing } from '../lib/api'

export default function ActivityPage() {
  const [accountId, setAccountId] = useState('')
  const [activities, setActivities] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<any|null>(null)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [ownedPacks, setOwnedPacks] = useState<any[]>([])
  const [listingTitleMap, setListingTitleMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
    if (!acc) { if (typeof window !== 'undefined') window.location.href = '/'; return }
    setAccountId(acc)
    ;(async () => {
      try {
        const acts = await listActivities(acc)
        setActivities(Array.isArray(acts) ? acts : [])
      } catch (e: any) { setStatus(e?.message || 'Load failed') }
      try {
        const kps = await listKnowledgePacks(acc)
        setOwnedPacks(Array.isArray(kps) ? kps : [])
      } catch {}
    })()
  }, [])

  useEffect(() => {
    const ids: string[] = Array.isArray(selected?.listing_ids) ? selected.listing_ids : []
    const missing = ids.filter(id => !listingTitleMap[id])
    if (!missing.length) return
    ;(async () => {
      const map = { ...listingTitleMap }
      for (const lid of missing) {
        try {
          const l = await getMarketplaceListing(lid)
          map[lid] = String(l?.title || 'Untitled Knowledge')
        } catch {}
      }
      setListingTitleMap(map)
    })()
  }, [selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const arr = activities.filter(a => !q || String(a.question||'').toLowerCase().includes(q))
    return arr
  }, [activities, query])

  const paged = useMemo(() => {
    const start = (page - 1) * size
    return filtered.slice(start, start + size)
  }, [filtered, page, size])

  const totalPages = Math.max(1, Math.ceil(filtered.length / size))

  return (
    <div className="page py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Activity</h2>
        {status && <div className="text-sm text-brand-brown/60">{status}</div>}
      </div>
      <div className="flex items-center gap-2">
        <a className="btn-outline" href="/profile">Profile</a>
        <a className="btn-secondary">Activity</a>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <input className="input max-w-sm" placeholder="Search question" value={query} onChange={e=>{ setQuery(e.target.value); setPage(1) }} />
          <button className="btn-outline btn-sm" onClick={async()=>{ try { const acts = await listActivities(accountId); setActivities(Array.isArray(acts)?acts:[]) } catch {} }}>Refresh</button>
        </div>
        {filtered.length === 0 ? (
          <div className="text-sm text-brand-brown/60">No activity found</div>
        ) : (
          <div className="space-y-2">
            {paged.map((a: any) => (
              <div key={a.id || `${a.created_at}-${Math.random()}`} className="card p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <button className="btn-ghost text-left w-full" onClick={()=> setSelected(a)}>
                    <div className="text-sm truncate" title={String(a.question || '')}>{String(a.question || '')}</div>
                  </button>
                  <div className="text-xs text-brand-brown/60 whitespace-nowrap">{new Date(a.created_at || Date.now()).toLocaleString()}</div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-sm">{Number(a.total_amount || 0)} COK</div>
                  <div className="flex gap-2">
                    <button className="btn-outline btn-sm" onClick={()=> setSelected(a)}>Details</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <span className="label">Rows</span>
            <select className="select w-24" value={size} onChange={e=>{ setSize(Number(e.target.value)); setPage(1) }}>
              {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button key={idx} className={page === (idx+1) ? 'btn-page-active' : 'btn-page'} onClick={()=> setPage(idx+1)}>{idx+1}</button>
            ))}
            <button className="btn-page" disabled={page<=1} onClick={()=> setPage(p=>Math.max(1,p-1))}>Prev</button>
            <button className="btn-page" disabled={page>=totalPages} onClick={()=> setPage(p=>Math.min(totalPages,p+1))}>Next</button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={()=> setSelected(null)}>
          <div className="modal-card max-w-2xl" onClick={e=> e.stopPropagation()}>
            <div className="space-y-3">
              <div className="font-semibold">Activity Details</div>
              <div className="text-sm text-brand-brown/60">{new Date(selected.created_at || Date.now()).toLocaleString()}</div>
              <div>
                <div className="label">Question</div>
                <div className="text-sm break-words">{String(selected.question || '')}</div>
              </div>
              <div>
                <div className="label">Answer</div>
                <div className="text-sm break-words whitespace-pre-wrap">{String(selected.answer || '')}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <div className="label">Knowledge (owned)</div>
                  <div className="text-xs">{(Array.isArray(selected.owned_ids) ? selected.owned_ids.map((id: string) => {
                    const k = ownedPacks.find(p => p.id === id)
                    return String(k?.title || id)
                  }).join(', ') : '') || '-'}</div>
                </div>
                <div>
                  <div className="label">Knowledge (rented)</div>
                  <div className="text-xs">{(Array.isArray(selected.listing_ids) ? selected.listing_ids.map((id: string) => listingTitleMap[id] || id).join(', ') : '') || '-'}</div>
                </div>
                <div>
                  <div className="label">Amount</div>
                  <div className="text-sm">{Number(selected.total_amount || 0)} COK</div>
                </div>
              </div>
              {selected && selected.charges && Object.keys(selected.charges).length > 0 && (
                <div className="space-y-1">
                  <div className="label">Payments</div>
                  <div className="text-xs font-mono">{Object.entries(selected.charges).map(([to, amt]) => `${to}:${amt}`).join(', ')}</div>
                </div>
              )}
              {Array.isArray(selected.transaction_ids) && selected.transaction_ids.length > 0 && (
                <div className="space-y-1">
                  <div className="label">Transactions</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.transaction_ids.map((t: string) => (
                      <a key={t} className="link" href={`https://hashscan.io/${(process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet')}/transaction/${encodeURIComponent(t)}`} target="_blank" rel="noreferrer">Hashscan</a>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button className="btn-outline" onClick={()=> setSelected(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
