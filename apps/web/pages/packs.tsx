import { useEffect, useState } from 'react'
import { listKnowledgePacks, createKnowledgePack, updateKnowledgePack, deleteKnowledgePack, listAgents, createAgent, updateAgent, deleteAgent } from '../lib/api'

export default function Packs() {
  const [kpTitle, setKpTitle] = useState('')
  const [kpContent, setKpContent] = useState('')
  const [packs, setPacks] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [editingPackId, setEditingPackId] = useState<string>('')
  const [editingPackTitle, setEditingPackTitle] = useState('')
  const [editingPackContent, setEditingPackContent] = useState('')
  const [agentName, setAgentName] = useState('')
  const [agentSpec, setAgentSpec] = useState('')
  const [agentKp, setAgentKp] = useState('')
  const [editingAgentId, setEditingAgentId] = useState<string>('')
  const [editingAgentName, setEditingAgentName] = useState('')
  const [editingAgentSpec, setEditingAgentSpec] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null
    if (!acc) { window.location.href = '/'; return }
    refresh()
  }, [])

  async function refresh() {
    try {
      const ps = await listKnowledgePacks()
      setPacks(ps)
      const as = await listAgents()
      setAgents(as)
    } catch (e: any) {
      setStatus(e?.message || 'Load failed')
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Packs</h2>
      {status && <div className={`text-sm ${/failed|error/i.test(status)?'text-red-600':'text-green-600'}`}>{status}</div>}

      <div className="space-y-3 border p-3">
        <div className="font-semibold">Upload Knowledge</div>
        <input className="w-full border p-2" placeholder="Title" value={kpTitle} onChange={e => setKpTitle(e.target.value)} />
        <textarea className="w-full border p-2 h-40" placeholder="Content" value={kpContent} onChange={e => setKpContent(e.target.value)} />
        <input type="file" accept=".txt,.md" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const txt = await f.text(); setKpContent(txt) }} />
        <button className="px-4 py-2 bg-blue-600 text-white" onClick={async ()=>{
          try {
            const kp = await createKnowledgePack(kpTitle, kpContent)
            setPacks(prev => [kp, ...prev])
            setKpTitle('')
            setKpContent('')
            setStatus('Knowledge uploaded')
          } catch (e: any) { setStatus(e?.message || 'Upload failed') }
        }}>Upload</button>
      </div>

      <div className="space-y-3 border p-3">
        <div className="font-semibold">Create Agent</div>
        <input className="w-full border p-2" placeholder="Agent Name" value={agentName} onChange={e => setAgentName(e.target.value)} />
        <input className="w-full border p-2" placeholder="Specialization (optional)" value={agentSpec} onChange={e => setAgentSpec(e.target.value)} />
        <select className="w-full border p-2" value={agentKp} onChange={e => setAgentKp(e.target.value)}>
          <option value="">Select Knowledge Pack</option>
          {packs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <button className="px-4 py-2 bg-green-600 text-white" onClick={async ()=>{
          try {
            if (!agentName || !agentKp) return
            const owner = localStorage.getItem('accountId') || undefined
            const ag = await createAgent(agentName, agentKp, owner, agentSpec || undefined)
            setAgents(prev => [ag, ...prev])
            setAgentName('')
            setAgentSpec('')
            setAgentKp('')
            setStatus('Agent created')
          } catch (e: any) { setStatus(e?.message || 'Create failed') }
        }}>Create Agent</button>
      </div>

      <div className="space-y-2">
        <div className="font-semibold">Knowledge Packs</div>
        <div className="grid grid-cols-1 gap-2">
          {packs.map(p => (
            <div key={p.id} className="border p-2 space-y-2">
              {editingPackId === p.id ? (
                <>
                  <input className="w-full border p-2" value={editingPackTitle} onChange={e => setEditingPackTitle(e.target.value)} />
                  <textarea className="w-full border p-2 h-32" value={editingPackContent} onChange={e => setEditingPackContent(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="px-3 py-1 border" onClick={async ()=>{
                      try {
                        const u = await updateKnowledgePack(p.id, { title: editingPackTitle, content: editingPackContent })
                        setPacks(prev => prev.map(x => x.id === p.id ? u : x))
                        setEditingPackId('')
                        setStatus('Pack updated')
                      } catch (e: any) { setStatus(e?.message || 'Update failed') }
                    }}>Save</button>
                    <button className="px-3 py-1 border" onClick={()=>{ setEditingPackId('') }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-sm whitespace-pre-wrap">{p.content}</div>
                  <div className="flex gap-2">
                    {String(p.title || '').toLowerCase().startsWith('arena ') ? (
                      <span className="text-sm text-gray-700">Arena pack (read-only)</span>
                    ) : (
                      <button className="px-3 py-1 border" onClick={()=>{ setEditingPackId(p.id); setEditingPackTitle(p.title); setEditingPackContent(p.content) }}>Edit</button>
                    )}
                    <button className="px-3 py-1 border" onClick={async ()=>{ try { await deleteKnowledgePack(p.id); setPacks(prev => prev.filter(x => x.id !== p.id)); setStatus('Pack deleted') } catch (e: any) { setStatus(e?.message || 'Delete failed') } }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-semibold">Agents</div>
        <div className="grid grid-cols-1 gap-2">
          {agents.map(a => (
            <div key={a.id} className="border p-2 space-y-2">
              {editingAgentId === a.id ? (
                <>
                  <input className="w-full border p-2" value={editingAgentName} onChange={e => setEditingAgentName(e.target.value)} />
                  <input className="w-full border p-2" value={editingAgentSpec} onChange={e => setEditingAgentSpec(e.target.value)} placeholder="Specialization (optional)" />
                  <div className="flex gap-2">
                    <button className="px-3 py-1 border" onClick={async ()=>{
                      try {
                        const u = await updateAgent(a.id, { name: editingAgentName, specialization: editingAgentSpec || undefined })
                        setAgents(prev => prev.map(x => x.id === a.id ? u : x))
                        setEditingAgentId('')
                        setStatus('Agent updated')
                      } catch (e: any) { setStatus(e?.message || 'Update failed') }
                    }}>Save</button>
                    <button className="px-3 py-1 border" onClick={()=>{ setEditingAgentId('') }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-semibold">{a.name}{a.specialization ? ` - ${a.specialization}` : ''}</div>
                  <div className="text-sm">Owner: {a.ownerAccountId || '-'}</div>
                  <div className="text-sm">Knowledge: {packs.find(p => p.id === a.knowledgePackId)?.title || a.knowledgePackId}</div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 border" onClick={()=>{ setEditingAgentId(a.id); setEditingAgentName(a.name); setEditingAgentSpec(a.specialization || '') }}>Edit</button>
                    <button className="px-3 py-1 border" onClick={async ()=>{ try { await deleteAgent(a.id); setAgents(prev => prev.filter(x => x.id !== a.id)); setStatus('Agent deleted') } catch (e: any) { setStatus(e?.message || 'Delete failed') } }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
