import { useEffect, useMemo, useRef, useState } from 'react'
import { listKnowledgePacks, listMarketplaceListings, getMarketplaceRentalStatus, chatPlayground, getMarketplaceListing } from '../lib/api'

export default function Playground() {
  const [accountId, setAccountId] = useState('')
  const [owned, setOwned] = useState<any[]>([])
  const [rented, setRented] = useState<any[]>([])
  const [loadingOwned, setLoadingOwned] = useState(true)
  const [loadingRented, setLoadingRented] = useState(true)
  const [selOwned, setSelOwned] = useState<string[]>([])
  const [selRented, setSelRented] = useState<string[]>([])
  const [selTitles, setSelTitles] = useState<{ type: 'owned'|'rented', id: string, title: string }[]>([])
  const [messages, setMessages] = useState<{ role: 'user'|'assistant', content: string }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const feedRef = useRef<HTMLDivElement|null>(null)

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
    setAccountId(acc)
  }, [])

  useEffect(() => {
    if (!accountId) return
    setLoadingOwned(true)
    listKnowledgePacks(accountId).then(setOwned).catch(()=>{}).finally(()=> setLoadingOwned(false))
  }, [accountId])

  useEffect(() => {
    if (!accountId) return
    setLoadingRented(true)
    listMarketplaceListings().then(async (list) => {
      const checks = await Promise.all(list.map((l: any) => {
        if (String(l.owner_account_id) === accountId) return Promise.resolve(null)
        return getMarketplaceRentalStatus(l.id, accountId).catch(()=> null)
      }))
      const active: any[] = []
      list.forEach((l: any, idx: number) => {
        const c = checks[idx]
        if (c && c.active) active.push(l)
      })
      setRented(active)
    }).catch(()=>{}).finally(()=> setLoadingRented(false))
  }, [accountId])

  useEffect(() => {
    if (!accountId) return
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(`playground_sources:${accountId}`) || '' : ''
      const parsed = raw ? JSON.parse(raw) : null
      const ownedSaved: { id: string, title?: string }[] = Array.isArray(parsed?.ownedSaved) ? parsed.ownedSaved : []
      const rentedSaved: { id: string, title?: string }[] = Array.isArray(parsed?.rentedSaved) ? parsed.rentedSaved : []
      const ownedIdsFallback: string[] = Array.isArray(parsed?.owned) ? parsed.owned : []
      const rentedIdsFallback: string[] = Array.isArray(parsed?.rented) ? parsed.rented : []
      const ownedToRestore: { id: string, title?: string }[] = ownedSaved.length ? ownedSaved : ownedIdsFallback.map(id => ({ id }))
      const rentedToRestore: { id: string, title?: string }[] = rentedSaved.length ? rentedSaved : rentedIdsFallback.map(id => ({ id }))
      // Restore owned selections immediately using saved titles (fallback to pack title when available)
      if (ownedToRestore.length) {
        ownedToRestore.forEach(({ id, title }) => {
          const k = owned.find(o => o.id === id)
          const t = title || k?.title || 'Untitled Knowledge'
          setSelOwned(ids => ids.includes(id) ? ids : [...ids, id])
          setSelTitles(ts => ts.some(x => x.type==='owned' && x.id===id) ? ts : [...ts, { type: 'owned', id, title: t }])
        })
      }
      // Restore rented selections only if still allowed (owner, active rental, or free)
      if (rentedToRestore.length) {
        (async () => {
          for (const item of rentedToRestore) {
            const lid = item.id
            try {
              const l = await getMarketplaceListing(lid)
              const isOwner = String(l?.owner_account_id || '') === String(accountId)
              if (!isOwner) {
                const status = await getMarketplaceRentalStatus(lid, accountId)
                if (!status?.active && Number(l?.price || 0) > 0) continue
              }
              setSelRented(ids => ids.includes(lid) ? ids : [...ids, lid])
              const t = item.title || String(l?.title || l?.knowledge_pack_id || 'Untitled Knowledge')
              setSelTitles(ts => ts.some(x => x.type==='rented' && x.id===lid) ? ts : [...ts, { type: 'rented', id: lid, title: t }])
            } catch {}
          }
        })()
      }
    } catch {}
  }, [accountId, owned])

  useEffect(() => {
    if (!accountId) return
    try {
      const ownedSaved = selTitles.filter(s => s.type==='owned').map(s => ({ id: s.id, title: s.title }))
      const rentedSaved = selTitles.filter(s => s.type==='rented').map(s => ({ id: s.id, title: s.title }))
      const payload = { ownedSaved, rentedSaved }
      if (typeof window !== 'undefined') localStorage.setItem(`playground_sources:${accountId}`, JSON.stringify(payload))
    } catch {}
  }, [accountId, selTitles])

  useEffect(() => {
    const parts = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const listing = parts?.get('listing') || ''
    if (!listing || !accountId) return
    ;(async () => {
      try {
        const l = await getMarketplaceListing(listing)
        const isOwner = String(l?.owner_account_id || '') === String(accountId)
        if (!isOwner) {
          const status = await getMarketplaceRentalStatus(listing, accountId)
          if (!status?.active && Number(l?.price || 0) > 0) return
        }
        setSelRented(ids => ids.includes(listing) ? ids : [...ids, listing])
        const title = String(l?.title || l?.knowledge_pack_id || 'Untitled Knowledge')
        setSelTitles(ts => ts.some(x => x.type==='rented' && x.id===listing) ? ts : [...ts, { type: 'rented', id: listing, title }])
      } catch {}
    })()
  }, [accountId])

  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const header = useMemo(() => {
    if (!selTitles.length) return 'Playground'
    const names = selTitles.map(s => s.title).slice(0,3).join(', ')
    const more = selTitles.length > 3 ? ` +${selTitles.length - 3}` : ''
    return `Chat with ${names}${more}`
  }, [selTitles])

  async function send() {
    if ((!selOwned.length && !selRented.length) || !input) return
    setSending(true)
    const msgs: { role: 'user'|'assistant', content: string }[] = [...messages, { role: 'user', content: input }]
    setMessages(msgs)
    setInput('')
    try {
      const out = await chatPlayground(accountId, selOwned, selRented, msgs)
      const reply = String(out?.reply || '')
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {}
    setSending(false)
  }

  return (
    <div className="page py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold truncate">{header}</h2>
        {!selTitles.length && <div className="text-sm text-brand-brown/60">Add knowledge to start chatting</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 flex flex-col gap-3">
          <div className="text-lg font-semibold">My Knowledge</div>
          {loadingOwned ? (
            <div className="text-sm text-brand-brown/60">Loading…</div>
          ) : owned.length === 0 ? (
            <div className="text-sm text-brand-brown/60">No knowledge packs yet</div>
          ) : (
            <div className="space-y-2 max-h-[12rem] overflow-y-auto">
              {owned.map((k: any) => (
                <div key={k.id} className="flex items-center justify-between gap-2">
                  <div className="truncate" title={k.title}>{k.title || 'Untitled Knowledge'}</div>
                  <button className={`btn-primary btn-sm ${selOwned.includes(k.id)?'bg-gray-200 text-gray-500 cursor-not-allowed':''}`} disabled={selOwned.includes(k.id)} onClick={()=>{
                    setSelOwned(ids => ids.includes(k.id) ? ids : [...ids, k.id])
                    setSelTitles(ts => ts.some(x => x.type==='owned' && x.id===k.id) ? ts : [...ts, { type: 'owned', id: k.id, title: k.title || 'Untitled Knowledge' }])
                  }}>Add</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4 flex flex-col gap-3">
          <div className="text-lg font-semibold">Rented Knowledge</div>
          {loadingRented ? (
            <div className="text-sm text-brand-brown/60">Loading…</div>
          ) : rented.length === 0 ? (
            <div className="text-sm text-brand-brown/60">No active rentals</div>
          ) : (
            <div className="space-y-2 max-h-[12rem] overflow-y-auto">
              {rented.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <div className="truncate" title={l.title || l.knowledge_pack_id}>{l.title || 'Untitled Knowledge'}</div>
                  <button className={`btn-primary btn-sm ${selRented.includes(l.id)?'bg-gray-200 text-gray-500 cursor-not-allowed':''}`} disabled={selRented.includes(l.id)} onClick={()=>{
                    setSelRented(ids => ids.includes(l.id) ? ids : [...ids, l.id])
                    setSelTitles(ts => ts.some(x => x.type==='rented' && x.id===l.id) ? ts : [...ts, { type: 'rented', id: l.id, title: l.title || 'Untitled Knowledge' }])
                  }}>Add</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-4 flex flex-col gap-3 h-[60vh]">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {selTitles.slice(0,3).map(s => (
              <span key={`${s.type}-${s.id}`} className="badge inline-flex items-center gap-2">
                <span className="truncate max-w-[12rem]" title={s.title}>{s.title}</span>
                <button className="btn-ghost btn-compact btn-sm" onClick={()=>{
                  if (s.type==='owned') setSelOwned(ids => ids.filter(id => id !== s.id))
                  else setSelRented(ids => ids.filter(id => id !== s.id))
                  setSelTitles(ts => ts.filter(x => !(x.type===s.type && x.id===s.id)))
                }}>×</button>
              </span>
            ))}
            {selTitles.length > 3 && (
              <span className="badge">{selTitles.length - 3}+ more</span>
            )}
          </div>
          <div>
            <button className="btn-outline btn-sm" onClick={()=>{ setSelOwned([]); setSelRented([]); setSelTitles([]); setMessages([]) }}>Clear</button>
          </div>
        </div>
        <div className="text-sm text-brand-brown/60">Answers are restricted to the selected knowledge.</div>
        <div ref={feedRef} className="space-y-3 flex-1 overflow-y-auto">
          {messages.map((m, idx) => (
            <div key={idx} className={m.role==='user' ? 'text-right' : ''}>
              <div className={`inline-block px-3 py-2 rounded-xl ${m.role==='user'?'bg-brand-yellow':'bg-brand-cream'}`}>{m.content}</div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-sm text-brand-brown/60">{selTitles.length ? 'Type a message to begin' : 'Add knowledge from the lists to begin'}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <textarea
            className="textarea"
            placeholder={selTitles.length ? 'Type your message' : 'Add knowledge first'}
            rows={2}
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={!selTitles.length}
          />
          <button className={`btn-primary ${sending || !selTitles.length ? 'bg-gray-200 text-gray-500 cursor-not-allowed':''}`} onClick={send} disabled={sending || !selTitles.length}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
