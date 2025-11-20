import { useEffect, useMemo, useRef, useState } from 'react'
import { listKnowledgePacks, listMarketplaceListings, getMarketplaceRentalStatus, chatPlayground, getMarketplaceListing, prepareX402Transfer, submitX402Transfer, checkX402Allowance, listActivities } from '../lib/api'

export default function Playground() {
  const [accountId, setAccountId] = useState('')
  const [owned, setOwned] = useState<any[]>([])
  const [rented, setRented] = useState<any[]>([])
  const [loadingOwned, setLoadingOwned] = useState(true)
  const [loadingRented, setLoadingRented] = useState(true)
  const [selOwned, setSelOwned] = useState<string[]>([])
  const [selRented, setSelRented] = useState<string[]>([])
  const [selTitles, setSelTitles] = useState<{ type: 'owned'|'rented', id: string, title: string }[]>([])
  const [listingMeta, setListingMeta] = useState<Record<string, { pricePerUse: number, ownerId: string }>>({})
  const [messages, setMessages] = useState<{ role: 'user'|'assistant', content: string }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const feedRef = useRef<HTMLDivElement|null>(null)
  const [paymentNeeded, setPaymentNeeded] = useState<{ amount?: number }|null>(null)
  const [activityQuery, setActivityQuery] = useState('')
  const [activities, setActivities] = useState<any[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [activitySelected, setActivitySelected] = useState<any|null>(null)
  const [activityPage, setActivityPage] = useState(1)
  const [activitySize, setActivitySize] = useState(10)
  const [activityOwnedTitles, setActivityOwnedTitles] = useState<Record<string, string>>({})
  const [activityRentedTitles, setActivityRentedTitles] = useState<Record<string, string>>({})

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
    setAccountId(acc)
  }, [])

  useEffect(() => {
    if (!accountId) return
    setLoadingOwned(true)
    listKnowledgePacks(accountId).then(setOwned).catch(()=>{}).finally(()=> setLoadingOwned(false))
    ;(async () => {
      try {
        const acts = await listActivities(accountId)
        setActivities(Array.isArray(acts) ? acts : [])
      } catch {}
    })()
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
              setListingMeta(m => ({ ...m, [lid]: { pricePerUse: Math.max(0, Number(l?.price_per_use || 0)), ownerId: String(l?.owner_account_id || '') } }))
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

  const perChatCost = useMemo(() => {
    return selRented.reduce((sum, id) => {
      const meta = listingMeta[id]
      if (!meta) return sum
      if (meta.ownerId === accountId) return sum
      return sum + Math.max(0, meta.pricePerUse || 0)
    }, 0)
  }, [selRented, listingMeta, accountId])

  const filteredActivities = useMemo(() => {
    const q = activityQuery.trim().toLowerCase()
    return activities.filter(a => !q || String(a.question||'').toLowerCase().includes(q))
  }, [activities, activityQuery])

  const pagedActivities = useMemo(() => {
    const start = (activityPage - 1) * activitySize
    return filteredActivities.slice(start, start + activitySize)
  }, [filteredActivities, activityPage, activitySize])

  const activityTotalPages = Math.max(1, Math.ceil(filteredActivities.length / activitySize))

  useEffect(() => {
    const ownMap: Record<string, string> = {}
    const rentMap: Record<string, string> = {}
    const missing: string[] = []
    if (activitySelected && Array.isArray(activitySelected.owned_ids)) {
      activitySelected.owned_ids.forEach((id: string) => {
        const k = owned.find(o => o.id === id)
        ownMap[id] = String(k?.title || 'Untitled Knowledge')
      })
    }
    setActivityOwnedTitles(ownMap)
    if (activitySelected && Array.isArray(activitySelected.listing_ids)) {
      activitySelected.listing_ids.forEach((lid: string) => {
        const l = rented.find(r => r.id === lid)
        if (l) rentMap[lid] = String(l.title || 'Untitled Knowledge')
        else missing.push(lid)
      })
    }
    setActivityRentedTitles(rentMap)
    if (missing.length) {
      ;(async () => {
        for (const lid of missing) {
          try {
            const l = await getMarketplaceListing(lid)
            rentMap[lid] = String(l?.title || 'Untitled Knowledge')
          } catch {}
        }
        setActivityRentedTitles({ ...rentMap })
      })()
    }
  }, [activitySelected, owned, rented])

  async function send() {
    if ((!selOwned.length && !selRented.length) || !input) return
    if (perChatCost > 0) {
      try {
        const accUse = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || accountId || '') : (accountId || '')
        const check = await checkX402Allowance(accUse, selRented)
        if (!check?.ok) {
          const decimals = Number(check?.decimals || 0)
          const toHuman = (tiny: number) => (decimals > 0 ? (tiny / Math.pow(10, decimals)) : tiny)
          const required = typeof check?.requiredTiny === 'number' ? toHuman(check.requiredTiny) : (check?.amount || perChatCost)
          const allowed = typeof check?.allowanceTiny === 'number' ? toHuman(check.allowanceTiny) : 0
          setPaymentNeeded({ amount: required })
          setMessages(m => [...m, { role: 'assistant', content: `Insufficient allowance. Required ${required} COK, allowance ${allowed} COK to 0.0.6496404. Pay with wallet or approve allowance.` }])
          return
        }
      } catch {}
    }
    setSending(true)
    const msgs: { role: 'user'|'assistant', content: string }[] = [...messages, { role: 'user', content: input }]
    console.log('playground send', { accountId, owned: selOwned, rented: selRented, messagesCount: msgs.length })
    setMessages(msgs)
    setInput('')
    try {
      const out = await chatPlayground(accountId, selOwned, selRented, msgs)
      const reply = String(out?.reply || '')
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e: any) {
      const msg = String(e?.message || 'Payment required')
      console.warn('playground chat error', { message: msg })
      let parsed: any = {}
      try { parsed = JSON.parse(msg) } catch {}
      if (parsed && parsed.code === 'X402') {
        const payload = { accountId, selOwned, selRented, perUse: selRented.map(id => ({ id, pricePerUse: listingMeta[id]?.pricePerUse, ownerId: listingMeta[id]?.ownerId })) }
        console.warn('x402 client 402', { error: parsed, payload })
        setPaymentNeeded({ amount: parsed.amount })
        setMessages(m => [...m, { role: 'assistant', content: parsed.error || 'Payment required' }])
      } else {
          if (msg.includes('HTTP 402')) {
            const payload = { accountId, selOwned, selRented, perUse: selRented.map(id => ({ id, pricePerUse: listingMeta[id]?.pricePerUse, ownerId: listingMeta[id]?.ownerId })) }
            console.warn('x402 client 402 fallback', { payload })
            setPaymentNeeded({ amount: perChatCost })
            setMessages(m => [...m, { role: 'assistant', content: `Payment required. Approve at least ${perChatCost} COK to 0.0.6496404 or pay with wallet.` }])
          } else {
            setMessages(m => [...m, { role: 'assistant', content: msg }])
          }
      }
    }
    setSending(false)
  }

  async function payWithWallet() {
    try {
      const accUse = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || accountId || '') : (accountId || '')
      const out = await prepareX402Transfer(accUse, selRented)
      if (!out?.bytes) { setPaymentNeeded(null); return }
      const bytesB64 = String(out.bytes)

      async function getHC() {
        const w: any = typeof window !== 'undefined' ? window : {}
        const mod: any = await import('hashconnect')
        const sdk: any = await import('@hashgraph/sdk')
        const HashConnect = mod.HashConnect || mod.default
        const LedgerId = sdk.LedgerId || sdk.default?.LedgerId
        const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID
        const network = process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet'
        if (!projectId) throw new Error('Missing NEXT_PUBLIC_WC_PROJECT_ID')
        const ledger = network === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET
        const appMetadata = { name: 'Debate Arena AI', description: 'Agent-to-Agent Debate Arena', icons: [], url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000' }
        if (w.__hashconnect) return w.__hashconnect
        const hc = new HashConnect(ledger, projectId, appMetadata, false)
        await hc.init()
        w.__hashconnect = hc
        return hc
      }

      const hc: any = await getHC()
      let topic = typeof window !== 'undefined' ? (sessionStorage.getItem('hcTopic') || '') : ''
      if (topic) {
        try { await hc.connect(topic) } catch { topic = '' }
      }
      if (!topic) {
        hc.openPairingModal()
        await new Promise<void>((resolve) => {
          hc.pairingEvent.once((data: any) => {
            const ids: string[] = Array.isArray(data?.accountIds) ? data.accountIds.map(String) : []
            const accId = ids[ids.length - 1] || ''
            const tp = data?.topic || ''
            if (tp) { try { sessionStorage.setItem('hcTopic', tp) } catch {} }
            if (accId) { try { sessionStorage.setItem('accountId', accId) } catch {} }
            topic = tp
            resolve()
          })
        })
        if (topic) {
          try { await hc.connect(topic) } catch {}
        }
      }

      const txBytes = Uint8Array.from(atob(bytesB64), c => c.charCodeAt(0))
      let resp: any
      try {
        resp = await hc.sendTransaction(topic, txBytes, true)
      } catch (err: any) {
        const m = String(err?.message || '')
        if (m.includes('Signer') && m.includes('session')) {
          try { sessionStorage.removeItem('hcTopic') } catch {}
          topic = ''
          hc.openPairingModal()
          await new Promise<void>((resolve) => {
            hc.pairingEvent.once((data: any) => {
              const ids: string[] = Array.isArray(data?.accountIds) ? data.accountIds.map(String) : []
              const accId = ids[ids.length - 1] || ''
              const tp = data?.topic || ''
              if (tp) { try { sessionStorage.setItem('hcTopic', tp) } catch {} }
              if (accId) { try { sessionStorage.setItem('accountId', accId) } catch {} }
              topic = tp
              resolve()
            })
          })
          if (topic) { try { await hc.connect(topic) } catch {} }
          resp = await hc.sendTransaction(topic, txBytes, true)
        } else {
          throw err
        }
      }

      const signedB64 = String(resp?.signedTransaction || '')
      if (!signedB64) throw new Error('Sign failed')
      const paymentPayload = { network: (process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet').toLowerCase() === 'mainnet' ? 'hedera-mainnet' : 'hedera-testnet', signedTransaction: signedB64 }
      const headerB64 = btoa(JSON.stringify(paymentPayload))
      const msgs: { role: 'user'|'assistant', content: string }[] = [...messages, { role: 'user', content: input }]
      const out2 = await chatPlayground(accUse, selOwned, selRented, msgs, headerB64)
      const reply2 = String(out2?.reply || '')
      setMessages(m => [...m, { role: 'assistant', content: reply2 }])
      setPaymentNeeded(null)
    } catch (e: any) {
      const msg = String(e?.message || 'Wallet payment failed')
      setMessages(m => [...m, { role: 'assistant', content: msg }])
    }
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
                    setListingMeta(m => ({ ...m, [l.id]: { pricePerUse: Math.max(0, Number(l?.price_per_use || 0)), ownerId: String(l?.owner_account_id || '') } }))
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
                <span className="truncate max-w-[4rem]" title={s.title}>{s.title}</span>
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
          <div className="flex items-center gap-3">
            <div className="text-sm text-brand-brown/70">Per chat: ${perChatCost} COK</div>
            {paymentNeeded && (
              <button className="btn-secondary btn-sm" onClick={payWithWallet}>Pay with Wallet</button>
            )}
            <button className="btn-outline btn-sm" onClick={()=> setActivityOpen(true)}>Activity</button>
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
      {activityOpen && (
        <div className="modal-backdrop" onClick={()=> { setActivityOpen(false); setActivitySelected(null) }}>
          <div className="modal-card max-w-3xl" onClick={e=> e.stopPropagation()}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Activity</div>
                <div className="flex items-center gap-2">
                  <input className="input" placeholder="Search question" value={activityQuery} onChange={e=>{ setActivityQuery(e.target.value); setActivityPage(1) }} />
                  <button className="btn-outline btn-sm" onClick={async()=>{ try { const acts = await listActivities(accountId); setActivities(Array.isArray(acts)?acts:[]) } catch {} }}>Refresh</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  {filteredActivities.length === 0 ? (
                    <div className="text-sm text-brand-brown/60">No activity found</div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {pagedActivities.map((a: any) => (
                        <div key={a.id || `${a.created_at}-${Math.random()}`} className={`card p-3 text-left ${activitySelected && (activitySelected.id===a.id) ? 'border border-brand-yellow' : ''}`}>
                          <button className="btn-ghost text-left w-full" onClick={()=> setActivitySelected(a)}>
                            <div className="text-sm truncate" title={String(a.question || '')}>{String(a.question || '')}</div>
                          </button>
                          <div className="flex items-center justify-between mt-2">
                            <div className="text-xs text-brand-brown/60">{new Date(a.created_at || Date.now()).toLocaleString()}</div>
                            <div className="text-sm">{Number(a.total_amount || 0)} COK</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <span className="label">Rows</span>
                      <select className="select w-24" value={activitySize} onChange={e=>{ setActivitySize(Number(e.target.value)); setActivityPage(1) }}>
                        {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      {Array.from({ length: activityTotalPages }).map((_, idx) => (
                        <button key={idx} className={activityPage === (idx+1) ? 'btn-page-active' : 'btn-page'} onClick={()=> setActivityPage(idx+1)}>{idx+1}</button>
                      ))}
                      <button className="btn-page" disabled={activityPage<=1} onClick={()=> setActivityPage(p=>Math.max(1,p-1))}>Prev</button>
                      <button className="btn-page" disabled={activityPage>=activityTotalPages} onClick={()=> setActivityPage(p=>Math.min(activityTotalPages,p+1))}>Next</button>
                    </div>
                  </div>
                </div>
                <div className="card p-4">
                  {!activitySelected ? (
                    <div className="text-sm text-brand-brown/60">Select an activity to see details</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="font-semibold">Details</div>
                      <div className="text-sm text-brand-brown/60">{new Date(activitySelected.created_at || Date.now()).toLocaleString()}</div>
                      <div>
                        <div className="label">Question</div>
                        <div className="text-sm break-words">{String(activitySelected.question || '')}</div>
                      </div>
                      <div>
                        <div className="label">Answer</div>
                        <div className="text-sm break-words whitespace-pre-wrap">{String(activitySelected.answer || '')}</div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <div className="label">Knowledge (owned)</div>
                          <div className="text-xs">{(Array.isArray(activitySelected.owned_ids) ? activitySelected.owned_ids.map((id: string) => activityOwnedTitles[id] || id).join(', ') : '') || '-'}</div>
                        </div>
                        <div>
                          <div className="label">Knowledge (rented)</div>
                          <div className="text-xs">{(Array.isArray(activitySelected.listing_ids) ? activitySelected.listing_ids.map((id: string) => activityRentedTitles[id] || id).join(', ') : '') || '-'}</div>
                        </div>
                        <div>
                          <div className="label">Amount</div>
                          <div className="text-sm">{Number(activitySelected.total_amount || 0)} COK</div>
                        </div>
                      </div>
                      {activitySelected && activitySelected.charges && Object.keys(activitySelected.charges).length > 0 && (
                        <div className="space-y-1">
                          <div className="label">Payments</div>
                          <div className="text-xs font-mono">{Object.entries(activitySelected.charges).map(([to, amt]) => `${to}:${amt}`).join(', ')}</div>
                        </div>
                      )}
                      {Array.isArray(activitySelected.transaction_ids) && activitySelected.transaction_ids.length > 0 && (
                        <div className="space-y-1">
                          <div className="label">Transactions</div>
                          <div className="flex flex-wrap gap-2">
                            {activitySelected.transaction_ids.map((t: string) => (
                              <a key={t} className="link" href={`https://hashscan.io/${(process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet')}/transaction/${encodeURIComponent(t)}`} target="_blank" rel="noreferrer">Hashscan</a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button className="btn-outline" onClick={()=> { setActivityOpen(false); setActivitySelected(null) }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
