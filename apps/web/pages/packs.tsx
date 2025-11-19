import { useEffect, useState } from 'react'
import { listKnowledgePacks, createKnowledgePack, updateKnowledgePack, listAgents, createAgent, updateAgent, addAgentKnowledge, removeAgentKnowledge, createMarketplaceListing } from '../lib/api'

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
  const [view, setView] = useState<'knowledge'|'agents'>('knowledge')
  const [kpQuery, setKpQuery] = useState('')
  const [agentQuery, setAgentQuery] = useState('')
  const [showPackId, setShowPackId] = useState<string>('')
  const [kpPage, setKpPage] = useState(1)
  const [kpSize, setKpSize] = useState(10)
  const [agentPage, setAgentPage] = useState(1)
  const [agentSize, setAgentSize] = useState(10)
  const [modal, setModal] = useState<{ type: string, id?: string } | null>(null)
  const [toasts, setToasts] = useState<{ id: string, kind: 'success'|'error', text: string }[]>([])

  function pushToast(kind: 'success'|'error', text: string) {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, kind, text }])
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)) }, 3500)
  }

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? sessionStorage.getItem('accountId') : null
    if (!acc) { window.location.href = '/'; return }
    refresh(String(acc))
  }, [])

  async function refresh(accId: string) {
    try {
      const ps = await listKnowledgePacks(accId)
      setPacks(ps)
      const as = await listAgents(accId)
      setAgents(as)
    } catch (e: any) {
      setStatus(e?.message || 'Load failed')
    }
  }

  return (
    <div className="page py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Packs</h2>
        <div className="flex gap-2">
          <button className={`btn-outline ${view==='knowledge'?'bg-brand-cream':''}`} onClick={()=>setView('knowledge')}>Knowledge</button>
          <button className={`btn-outline ${view==='agents'?'bg-brand-cream':''}`} onClick={()=>setView('agents')}>Agents</button>
        </div>
      </div>

      {view==='knowledge' ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <input className="input max-w-sm" placeholder="Search title" value={kpQuery} onChange={e=>setKpQuery(e.target.value)} />
            <button className="btn-primary" onClick={()=> setModal({ type: 'upload' })}>Add Knowledge</button>
          </div>

          <div className="card space-y-3">
            <table className="table table-zebra">
              <thead>
                <tr className="text-left">
                  <th className="p-2 font-semibold w-1/2">Title</th>
                  <th className="p-2 font-semibold text-left w-48">Created</th>
                  <th className="p-2 font-semibold w-52">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packs.filter(p => !kpQuery || String(p.title||'').toLowerCase().includes(kpQuery.toLowerCase())).slice((kpPage-1)*kpSize, kpPage*kpSize).map(p => (
                  <tr key={p.id} className="align-top">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="avatar" aria-hidden>{String(p.title||'').slice(0,1).toUpperCase()}</div>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="truncate max-w-xs text-base font-medium" title={p.title}>{p.title}</div>
                          {String(p.title || '').toLowerCase().startsWith('pros') && (
                            <span className="badge badge-muted">Pros</span>
                          )}
                          {String(p.title || '').toLowerCase().startsWith('cons') && (
                            <span className="badge badge-muted">Cons</span>
                          )}
                          {p.listed && (
                            <span className="badge bg-blue-100 text-blue-800">Listed</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 w-48 text-sm text-left font-mono whitespace-nowrap text-brand-brown/60">{p.createdAt ? (()=>{ const dt=new Date(p.createdAt); const dd=String(dt.getDate()).padStart(2,'0'); const mm=String(dt.getMonth()+1).padStart(2,'0'); const yyyy=dt.getFullYear(); return `${dd}/${mm}/${yyyy}`; })() : '-'}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <button className="btn-ghost btn-sm btn-compact" onClick={()=> setModal({ type: 'viewPack', id: p.id })}>View</button>
                        {String(p.title || '').toLowerCase().startsWith('arena ') ? (
                          <span className="badge badge-muted inline-flex justify-center w-24">Locked</span>
                        ) : (
                          <button className="btn-ghost btn-sm btn-compact w-24 justify-center" onClick={()=>{ setEditingPackId(p.id); setEditingPackTitle(p.title); setEditingPackContent(p.content); setModal({ type: 'editPack', id: p.id }) }}>Edit</button>
                        )}
                        {(() => {
                          const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
                          const isOwner = String(p.ownerAccountId || '') === acc
                          return isOwner ? (
                            <button className={`btn-outline btn-sm btn-compact ${p.listed ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} disabled={p.listed} onClick={async ()=>{
                              try {
                                const accId = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
                                await createMarketplaceListing(p.id, accId)
                                setPacks(prev => prev.map(x => x.id === p.id ? { ...x, listed: true } : x))
                                pushToast('success','Listed for rent in marketplace')
                              } catch (e: any) { pushToast('error', e?.message || 'Listing failed') }
                            }}>Rent</button>
                          ) : null
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
                {packs.filter(p => !kpQuery || String(p.title||'').toLowerCase().includes(kpQuery.toLowerCase())).length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">No knowledge found</div>
                          <div className="text-sm text-brand-brown/60">Try adjusting search or upload new knowledge.</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-4 mb-1">
              <div className="flex items-center gap-2">
                <span className="label">Rows</span>
                <select className="select w-24" value={kpSize} onChange={e=>{ setKpSize(Number(e.target.value)); setKpPage(1) }}>
                  {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.max(1, Math.ceil(packs.filter(p => !kpQuery || String(p.title||'').toLowerCase().includes(kpQuery.toLowerCase())).length / kpSize)) }).map((_, idx) => (
                  <button key={idx} className={kpPage === (idx+1) ? 'btn-page-active' : 'btn-page'} onClick={()=> setKpPage(idx+1)}>{idx+1}</button>
                ))}
                <button className="btn-page" disabled={kpPage<=1} onClick={()=>setKpPage(p=>Math.max(1,p-1))}>Prev</button>
                <button className="btn-page" disabled={(kpPage*kpSize)>=packs.filter(p => !kpQuery || String(p.title||'').toLowerCase().includes(kpQuery.toLowerCase())).length} onClick={()=>setKpPage(p=>p+1)}>Next</button>
              </div>
            </div>
          </div>
          
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <input className="input max-w-sm" placeholder="Search name" value={agentQuery} onChange={e=>setAgentQuery(e.target.value)} />
            <button className="btn-secondary" onClick={()=> setModal({ type: 'createAgent' })}>Create Agent</button>
          </div>
          <div className="card space-y-3">
            <table className="table table-zebra">
              <thead>
                <tr className="text-left">
                  <th className="p-2 font-semibold w-1/2">Name</th>
                  <th className="p-2 font-semibold">Specialization</th>
                  <th className="p-2 font-semibold">Knowledge</th>
                  <th className="p-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.filter(a => !agentQuery || String(a.name||'').toLowerCase().includes(agentQuery.toLowerCase())).slice((agentPage-1)*agentSize, agentPage*agentSize).map(a => (
                  <tr key={a.id}>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="avatar" aria-hidden>{String(a.name||'').slice(0,1).toUpperCase()}</div>
                        <div className="truncate max-w-xs text-base font-medium" title={a.name}>{a.name}</div>
                      </div>
                    </td>
                    <td className="p-2">{a.specialization || '-'}</td>
                    <td className="p-2 text-sm">
                      <div className="truncate max-w-xs">
                        {Array.isArray(a.knowledgePackIds) && a.knowledgePackIds.length ? a.knowledgePackIds.map((kid: string) => packs.find(p => p.id === kid)?.title || kid).join(', ') : '-'}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <button className="btn-ghost btn-sm btn-compact" onClick={()=>{ setEditingAgentId(a.id); setEditingAgentName(a.name); setEditingAgentSpec(a.specialization || ''); setModal({ type: 'editAgent', id: a.id }) }}>Edit</button>
                        
                      </div>
                    </td>
                  </tr>
                ))}
                {agents.filter(a => !agentQuery || String(a.name||'').toLowerCase().includes(agentQuery.toLowerCase())).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">No agents found</div>
                          <div className="text-sm text-brand-brown/60">Try adjusting search or create a new agent.</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-4 mb-1">
              <div className="flex items-center gap-2">
                <span className="label">Rows</span>
                <select className="select w-24" value={agentSize} onChange={e=>{ setAgentSize(Number(e.target.value)); setAgentPage(1) }}>
                  {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.max(1, Math.ceil(agents.filter(a => !agentQuery || String(a.name||'').toLowerCase().includes(agentQuery.toLowerCase())).length / agentSize)) }).map((_, idx) => (
                  <button key={idx} className={agentPage === (idx+1) ? 'btn-page-active' : 'btn-page'} onClick={()=> setAgentPage(idx+1)}>{idx+1}</button>
                ))}
                <button className="btn-page" disabled={agentPage<=1} onClick={()=>setAgentPage(p=>Math.max(1,p-1))}>Prev</button>
                <button className="btn-page" disabled={(agentPage*agentSize)>=agents.filter(a => !agentQuery || String(a.name||'').toLowerCase().includes(agentQuery.toLowerCase())).length} onClick={()=>setAgentPage(p=>p+1)}>Next</button>
              </div>
            </div>
          </div>
          
        </>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={()=> setModal(null)}>
          <div className="modal-card" onClick={e=> e.stopPropagation()}>
            {modal.type === 'upload' && (
              <div className="space-y-3">
                <div className="font-semibold">Upload Knowledge</div>
                <input className="input" placeholder="Title" value={kpTitle} onChange={e => setKpTitle(e.target.value)} />
                <textarea className="textarea h-40" placeholder="Content" value={kpContent} onChange={e => setKpContent(e.target.value)} />
                <input type="file" accept=".txt,.md" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const txt = await f.text(); setKpContent(txt) }} />
                <div className="flex gap-2 justify-end">
                  <button className="btn-outline" onClick={()=> setModal(null)}>Cancel</button>
                  <button className="btn-primary" disabled={!kpTitle || !kpContent} onClick={async ()=>{
                    try {
                      const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
                      const kp = await createKnowledgePack(kpTitle, kpContent, acc)
                      setPacks(prev => [kp, ...prev])
                      setKpTitle('')
                      setKpContent('')
                      setModal(null)
                      pushToast('success','Knowledge uploaded')
                    } catch (e: any) { pushToast('error', e?.message || 'Upload failed') }
                  }}>Upload</button>
                </div>
              </div>
            )}
            {modal.type === 'viewPack' && modal.id && (
              <div className="space-y-3">
                {packs.filter(p=>p.id===modal.id).map(p => (
                  <div key={p.id}>
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-sm whitespace-pre-wrap">{p.content}</div>
                  </div>
                ))}
                <div className="flex justify-end"><button className="btn-outline" onClick={()=> setModal(null)}>Close</button></div>
              </div>
            )}
            {modal.type === 'editPack' && modal.id && (
              <div className="space-y-3">
                <div className="font-semibold">Edit Pack</div>
                <input className="input" value={editingPackTitle} onChange={e => setEditingPackTitle(e.target.value)} />
                <textarea className="textarea h-32" value={editingPackContent} onChange={e => setEditingPackContent(e.target.value)} />
                <div className="flex gap-2 justify-end">
                  <button className="btn-outline" onClick={()=>{ setEditingPackId(''); setModal(null) }}>Cancel</button>
                  <button className="btn-secondary" onClick={async ()=>{
                    try {
                      const u = await updateKnowledgePack(editingPackId, { title: editingPackTitle, content: editingPackContent })
                      setPacks(prev => prev.map(x => x.id === editingPackId ? u : x))
                      setEditingPackId('')
                      setModal(null)
                      pushToast('success','Pack updated')
                    } catch (e: any) { pushToast('error', e?.message || 'Update failed') }
                  }}>Save</button>
                </div>
              </div>
            )}
            {false}
            {modal.type === 'createAgent' && (
              <div className="space-y-3">
                <div className="font-semibold">Create Agent</div>
                <input className="input" placeholder="Agent Name" value={agentName} onChange={e => setAgentName(e.target.value)} />
                <input className="input" placeholder="Specialization (optional)" value={agentSpec} onChange={e => setAgentSpec(e.target.value)} />
                <select className="select w-full" value={agentKp} onChange={e => setAgentKp(e.target.value)}>
                  <option value="">Select Knowledge Pack</option>
                  {packs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <div className="flex gap-2 justify-end">
                  <button className="btn-outline" onClick={()=> setModal(null)}>Cancel</button>
                  <button className="btn-secondary" disabled={!agentName || !agentKp} onClick={async ()=>{
                    try {
                      const owner = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || undefined) : undefined
                      const ag = await createAgent(agentName, agentKp, owner, agentSpec || undefined)
                      setAgents(prev => [ag, ...prev])
                      setAgentName('')
                      setAgentSpec('')
                      setAgentKp('')
                      setModal(null)
                      pushToast('success','Agent created')
                    } catch (e: any) { pushToast('error', e?.message || 'Create failed') }
                  }}>Create</button>
                </div>
              </div>
            )}
            {modal.type === 'editAgent' && modal.id && (
              <div className="space-y-3">
                <div className="font-semibold">Edit Agent</div>
                <input className="input" value={editingAgentName} onChange={e => setEditingAgentName(e.target.value)} />
                <input className="input" value={editingAgentSpec} onChange={e => setEditingAgentSpec(e.target.value)} placeholder="Specialization (optional)" />
                <div className="space-y-2">
                  <div>
                    <div className="text-sm font-medium">Attached Knowledge</div>
                    <div className="flex flex-wrap gap-1">
                      {agents.find(x => x.id === editingAgentId)?.knowledgePackIds?.map((kid: string) => (
                        <span key={kid} className="badge badge-muted">
                          {packs.find(p => p.id === kid)?.title || kid}
                          <button className="ml-2 btn-ghost btn-sm btn-compact" onClick={async ()=>{
                            try {
                              const u = await removeAgentKnowledge(editingAgentId, kid)
                              setAgents(prev => prev.map(x => x.id === editingAgentId ? u : x))
                              pushToast('success','Removed knowledge')
                            } catch (e: any) { pushToast('error', e?.message || 'Remove failed') }
                          }}>Remove</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <select className="select" value={agentKp} onChange={e=> setAgentKp(e.target.value)}>
                      <option value="">Add Knowledge Pack</option>
                      {packs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                    <button className="btn-outline" disabled={!agentKp} onClick={async ()=>{
                      try {
                        const u = await addAgentKnowledge(editingAgentId, agentKp)
                        setAgents(prev => prev.map(x => x.id === editingAgentId ? u : x))
                        setAgentKp('')
                        pushToast('success','Knowledge added')
                      } catch (e: any) { pushToast('error', e?.message || 'Add failed') }
                    }}>Add</button>
                  </div>
                </div>
                <div className="flex gap-2 justify-end mt-3">
                  <button className="btn-outline" onClick={()=>{ setEditingAgentId(''); setModal(null) }}>Cancel</button>
                  <button className="btn-secondary" onClick={async ()=>{
                    try {
                      const u = await updateAgent(editingAgentId, { name: editingAgentName, specialization: editingAgentSpec || undefined })
                      setAgents(prev => prev.map(x => x.id === editingAgentId ? u : x))
                      setEditingAgentId('')
                      setModal(null)
                      pushToast('success','Agent updated')
                    } catch (e: any) { pushToast('error', e?.message || 'Update failed') }
                  }}>Save</button>
                </div>
              </div>
            )}
            {false}
          </div>
        </div>
      )}

      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={t.kind==='success' ? 'toast-success' : 'toast-error'}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}
