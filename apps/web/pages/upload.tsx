import { useEffect, useState } from 'react'
import { createKnowledgePack, listKnowledgePacks, createAgent } from '../lib/api'

export default function Upload() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [list, setList] = useState<any[]>([])
  const [agentName, setAgentName] = useState('')
  const [selectedKp, setSelectedKp] = useState('')
  const [createdAgent, setCreatedAgent] = useState<any | null>(null)
  const [specialization, setSpecialization] = useState('')

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null
    if (!acc) {
      window.location.href = '/'
      return
    }
    listKnowledgePacks().then(setList)
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Upload Knowledge Pack</h2>
      <div className="space-y-2">
        <input className="w-full border p-2" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="w-full border p-2 h-40" placeholder="Content" value={content} onChange={e => setContent(e.target.value)} />
        <input type="file" accept=".txt,.md" onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const txt = await f.text()
          setContent(txt)
        }} />
        <button className="px-4 py-2 bg-blue-600 text-white" onClick={async () => {
          const kp = await createKnowledgePack(title, content)
          setList(prev => [kp, ...prev])
          setTitle('')
          setContent('')
        }}>Save</button>
      </div>
      <h3 className="text-xl font-semibold">Create Agent</h3>
      <div className="space-y-2">
        <input className="w-full border p-2" placeholder="Agent Name" value={agentName} onChange={e => setAgentName(e.target.value)} />
        <input className="w-full border p-2" placeholder="Specialization (optional)" value={specialization} onChange={e => setSpecialization(e.target.value)} />
        <select className="w-full border p-2" value={selectedKp} onChange={e => setSelectedKp(e.target.value)}>
          <option value="">Select Knowledge Pack</option>
          {list.map(k => <option key={k.id} value={k.id}>{k.title}</option>)}
        </select>
        <button className="px-4 py-2 bg-green-600 text-white" onClick={async () => {
          if (!agentName || !selectedKp) return
          const owner = localStorage.getItem('accountId') || undefined
          const ag = await createAgent(agentName, selectedKp, owner, specialization || undefined)
          setCreatedAgent(ag)
        }}>Create Agent</button>
        {createdAgent && (
          <div className="p-3 border">Agent created: {createdAgent.name} {createdAgent.specialization ? `- ${createdAgent.specialization}` : ''}</div>
        )}
      </div>
      <div>
        <h3 className="text-xl font-semibold">Knowledge Packs</h3>
        <ul className="space-y-1">
          {list.map(k => (
            <li key={k.id} className="border p-2">{k.title}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
