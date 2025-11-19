import { useEffect, useRef, useState } from 'react'
import { chatMarketplace, getMarketplaceListing, getMarketplaceRentalStatus } from '../../lib/api'

export default function MarketplaceChat() {
  const [listingId, setListingId] = useState<string>('')
  const [messages, setMessages] = useState<{ role: 'user'|'assistant', content: string }[]>([])
  const [title, setTitle] = useState<string>('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const mounted = useRef(false)
  const feedRef = useRef<HTMLDivElement|null>(null)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    const parts = typeof window !== 'undefined' ? window.location.pathname.split('/') : []
    const id = parts[parts.length - 1]
    setListingId(id)
    getMarketplaceListing(id).then(async l => {
      setTitle(String(l?.title || ''))
      const accId = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
      const ownerId = String(l?.owner_account_id || '')
      if (!accId) { window.location.href = '/marketplace'; return }
      const isOwner = ownerId === accId
      if (isOwner) return
      try {
        const status = await getMarketplaceRentalStatus(id, accId)
        if (!status?.active) { window.location.href = '/marketplace'; return }
      } catch { window.location.href = '/marketplace' }
    }).catch(()=>{})
  }, [])

  useEffect(() => {
    const el = feedRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  async function send() {
    if (!input || !listingId) return
    setSending(true)
    const msgs: { role: 'user'|'assistant', content: string }[] = [...messages, { role: 'user', content: input }]
    setMessages(msgs)
    setInput('')
    try {
      const accId = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
      const out = await chatMarketplace(listingId, accId, msgs)
      const reply = String(out?.reply || '')
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {}
    setSending(false)
  }

  return (
    <div className="page py-8 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">{title ? `Chat with ${title}` : 'Chat'}</h2>
        <div className="text-sm text-brand-brown/60">Answers are strictly based on the selected knowledge pack.</div>
      </div>
      <div className="card p-4 flex flex-col gap-3 h-[70vh]">
        <div ref={feedRef} className="space-y-3 flex-1 overflow-y-auto">
          {messages.map((m, idx) => (
            <div key={idx} className={m.role==='user' ? 'text-right' : ''}>
              <div className={`inline-block px-3 py-2 rounded-xl ${m.role==='user'?'bg-brand-yellow':'bg-brand-cream'}`}>{m.content}</div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-sm text-brand-brown/60">Ask anything. The assistant will answer using the knowledge pack.</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <textarea
            className="textarea"
            placeholder="Type your message"
            rows={2}
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button className={`btn-primary ${sending?'bg-gray-200 text-gray-500 cursor-not-allowed':''}`} onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
