import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listAgents, listLeaderboardAccounts } from '../lib/api'

export default function Profile() {
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [elo, setElo] = useState<number>(0)
  const [agentCount, setAgentCount] = useState<number>(0)
  const [knowledgeCount, setKnowledgeCount] = useState<number>(0)
  const [status, setStatus] = useState('')
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: 'success'|'error'|'info' }[]>([])

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
    if (!acc) { if (typeof window !== 'undefined') window.location.href = '/'; return }
    setAccountId(acc)
    ;(async () => {
      try {
        const { data } = await supabase.from('users').select('name').eq('account_id', acc).maybeSingle()
        setName(String(data?.name || ''))
      } catch {}
      try {
        const agents = await listAgents()
        const mine = (Array.isArray(agents) ? agents : []).filter((a: any) => String(a.ownerAccountId||'') === acc)
        setAgentCount(mine.length)
        const kpIds: string[] = []
        for (const a of mine) {
          if (Array.isArray(a.knowledgePackIds)) {
            for (const kid of a.knowledgePackIds) kpIds.push(String(kid))
          }
        }
        const uniq = Array.from(new Set(kpIds))
        setKnowledgeCount(uniq.length)
      } catch {}
      try {
        const lb = await listLeaderboardAccounts()
        const me = (Array.isArray(lb) ? lb : []).find((x: any) => String(x.accountId) === acc)
        setElo(Number(me?.elo || 0))
      } catch {}
    })()
  }, [])

  async function handleSaveName() {
    if (!accountId) return
    setSaving(true)
    setStatus('')
    try {
      const { error } = await supabase.from('users').update({ name }).eq('account_id', accountId)
      if (error) throw new Error(error.message || 'Update failed')
      setStatus('Saved')
      {
        const tid = `${Date.now()}-${Math.random()}`
        setToasts(t => [...t, { id: tid, text: 'Name updated', kind: 'success' }])
        setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 3000)
      }
    } catch (e: any) {
      setStatus(e?.message || 'Save failed')
      {
        const tid = `${Date.now()}-${Math.random()}`
        setToasts(t => [...t, { id: tid, text: e?.message || 'Update failed', kind: 'error' }])
        setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 4000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page py-8 space-y-6">
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={t.kind==='success' ? 'toast-success' : t.kind==='error' ? 'toast-error' : 'toast'}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">{t.text}</div>
              <button className="btn-ghost btn-sm" onClick={()=> setToasts(ts => ts.filter(x => x.id !== t.id))}>Close</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Profile</h2>
        {status && <div className="text-sm text-brand-brown/60">{status}</div>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <div className="label">Name</div>
          <div className="flex items-center gap-2">
            <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" />
            <button className={`btn-secondary ${saving ? 'bg-gray-200 text-gray-500 hover:bg-gray-200 cursor-not-allowed' : ''}`} onClick={handleSaveName} disabled={saving}>Save</button>
          </div>
        </div>
        <div className="card p-4 space-y-2">
          <div className="label">Account ID</div>
          <div className="font-mono text-sm">{accountId || '-'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="label">Agents</div>
          <div className="text-2xl font-bold">{agentCount}</div>
        </div>
        <div className="card p-4">
          <div className="label">Knowledge</div>
          <div className="text-2xl font-bold">{knowledgeCount}</div>
        </div>
        <div className="card p-4">
          <div className="label">ELO Rating</div>
          <div className="text-2xl font-bold">{elo}</div>
        </div>
      </div>
    </div>
  )
}
