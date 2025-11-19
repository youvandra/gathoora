import { useEffect, useState } from 'react'
import { listMarketplaceListings, getMarketplaceRentalStatus, rentMarketplace } from '../lib/api'

export default function Marketplace() {
  const [accountId, setAccountId] = useState('')
  const [listings, setListings] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [rentId, setRentId] = useState<string>('')
  const [minutes, setMinutes] = useState<string>('')
  const [renting, setRenting] = useState(false)
  const [rentError, setRentError] = useState('')
  const [canUse, setCanUse] = useState<Record<string, boolean>>({})
  useEffect(() => {
    listMarketplaceListings().then(setListings).catch(()=>{})
  }, [])
  useEffect(() => {
    const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
    setAccountId(acc)
  }, [])
  function formatDate(val: any) {
    const dt = new Date(val)
    const dd = String(dt.getDate()).padStart(2, '0')
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const yyyy = dt.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }
  useEffect(() => {
    (async () => {
      const next: Record<string, boolean> = {}
      for (const l of listings) {
        const isOwner = String(l.owner_account_id) === String(accountId)
        if (isOwner) { next[l.id] = true; continue }
        const free = Number(l.price || 0) === 0
        if (free) { next[l.id] = true; continue }
        if (!accountId) { next[l.id] = false; continue }
        try {
          const status = await getMarketplaceRentalStatus(l.id, accountId)
          next[l.id] = !!status?.active
        } catch { next[l.id] = false }
      }
      setCanUse(next)
    })()
  }, [listings, accountId])
  function onUse(l: any) {
    try {
      if (typeof window !== 'undefined' && accountId) {
        const key = `playground_sources:${accountId}`
        const raw = localStorage.getItem(key) || ''
        const parsed = raw ? JSON.parse(raw) : {}
        const rentedSaved: { id: string, title?: string }[] = Array.isArray(parsed?.rentedSaved) ? parsed.rentedSaved : []
        const title = String(l?.title || l?.knowledge_pack_id || 'Untitled Knowledge')
        if (!rentedSaved.some(x => x.id === l.id)) rentedSaved.push({ id: l.id, title })
        const payload = { ownedSaved: Array.isArray(parsed?.ownedSaved) ? parsed.ownedSaved : [], rentedSaved }
        localStorage.setItem(key, JSON.stringify(payload))
      }
    } catch {}
    window.location.href = `/playground?listing=${encodeURIComponent(l.id)}`
  }
  function onRent(l: any) {
    setRentError('')
    setRentId(l.id)
    setMinutes('30')
  }
  async function confirmRent() {
    if (!rentId) return
    const accId = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
    if (!accId) { setRentError('Missing account'); return }
    const minsNum = Math.max(1, parseInt(minutes || '0', 10))
    setRenting(true)
    setRentError('')
    try {
      const r = await rentMarketplace(rentId, accId, minsNum)
      if (r && !r.error) { window.location.href = `/playground?listing=${encodeURIComponent(rentId)}`; return }
      setRentError(String(r?.error || 'Rent failed'))
    } catch (e: any) { setRentError(String(e?.message || 'Rent failed')) }
    setRenting(false)
  }
  return (
    <div className="page py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Marketplace</h2>
        <input className="input max-w-sm" placeholder="Search title" value={query} onChange={e=>setQuery(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3">
        {listings.filter(l => !query || String(l.title||l.knowledge_pack_id||'').toLowerCase().includes(query.toLowerCase())).map(l => (
          <div key={l.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold" title={l.title || l.knowledge_pack_id}>{l.title || 'Untitled Knowledge'}</div>
                <div className="text-xs text-brand-brown/60">Owner <span className="font-mono">{l.owner_account_id}</span> • {formatDate(l.created_at)}</div>
              </div>
              {canUse[l.id] ? (
                <button className="btn-primary" onClick={()=>onUse(l)}>Use</button>
              ) : (
                <button className="btn-secondary" onClick={()=>onRent(l)}>Rent</button>
              )}
            </div>
          </div>
        ))}
        {listings.length === 0 && (
          <div className="card p-4"><div className="text-center text-sm text-brand-brown/60">No listings yet</div></div>
        )}
      </div>
      {rentId && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center">
          <div className="card p-6 space-y-4 max-w-sm w-full">
            <div className="text-lg font-semibold">Rent to Use in Playground</div>
            <div className="space-y-2">
              <label className="text-sm">Duration (minutes)</label>
              <input className="input" type="number" min={1} value={minutes} onChange={e=>setMinutes(e.target.value)} />
            </div>
            {rentError && (<div className="text-sm text-red-600">{rentError}</div>)}
            <div className="flex items-center justify-end gap-2">
              <button className="btn-outline" onClick={()=>{ setRentId(''); setMinutes(''); setRentError(''); setRenting(false) }}>Cancel</button>
              <button className={`btn-primary ${renting?'bg-gray-200 text-gray-500 cursor-not-allowed':''}`} disabled={renting} onClick={confirmRent}>Confirm Rent</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
