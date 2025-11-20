import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listAgents, listLeaderboardAccounts, updateUserName, mintCokToken, createCustodialAccount, listActivities } from '../lib/api'

export default function Profile() {
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [elo, setElo] = useState<number>(0)
  const [agentCount, setAgentCount] = useState<number>(0)
  const [knowledgeCount, setKnowledgeCount] = useState<number>(0)
  const [status, setStatus] = useState('')
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: 'success'|'error'|'info' }[]>([])
  const [cokBalance, setCokBalance] = useState<string>('')
  const [cokLoading, setCokLoading] = useState<boolean>(false)
  const [minting, setMinting] = useState<boolean>(false)
  const [needAssociate, setNeedAssociate] = useState<boolean>(false)
  

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
      try {
        setCokLoading(true)
        const network = process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet'
        const base = network === 'mainnet' ? 'https://mainnet.mirrornode.hedera.com' : 'https://testnet.mirrornode.hedera.com'
        const url = `${base}/api/v1/accounts/${encodeURIComponent(acc)}/tokens?token.id=0.0.7284519`
        const r = await fetch(url)
        const j = await r.json()
        const tokens = Array.isArray(j?.tokens) ? j.tokens : []
        const rel = tokens.find((t: any) => String(t?.token_id) === '0.0.7284519')
        setNeedAssociate(!rel)
        if (rel && typeof rel.balance === 'number') {
          const decimals = typeof rel.decimals === 'number' ? rel.decimals : 0
          const human = decimals > 0 ? (rel.balance / Math.pow(10, decimals)) : rel.balance
          setCokBalance(String(human))
        } else {
          setCokBalance('0')
        }
      } catch {
        setCokBalance('')
      } finally { setCokLoading(false) }
    })()
  }, [])

  async function handleSaveName() {
    if (!accountId) return
    setSaving(true)
    setStatus('')
    try {
      const { data: sessData } = await supabase.auth.getSession()
      const uid = sessData?.session?.user?.id
      if (uid) {
        const { data: cw } = await supabase.from('custodial_wallets').select('account_id').eq('user_id', uid).maybeSingle()
        if (!cw || String(cw.account_id) !== accountId) {
          const out = await updateUserName(accountId, name)
          if (out && out.error) throw new Error(out.error)
        } else {
          const { error } = await supabase.from('users').update({ name }).eq('account_id', accountId)
          if (error) throw new Error(error.message || 'Update failed')
        }
      } else {
        const out = await updateUserName(accountId, name)
        if (out && out.error) throw new Error(out.error)
      }
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

  async function refreshCok() {
    if (!accountId) return
    try {
      setCokLoading(true)
      const network = process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet'
      const base = network === 'mainnet' ? 'https://mainnet.mirrornode.hedera.com' : 'https://testnet.mirrornode.hedera.com'
      const url = `${base}/api/v1/accounts/${encodeURIComponent(accountId)}/tokens?token.id=0.0.7284519`
      const r = await fetch(url)
      const j = await r.json()
      const tokens = Array.isArray(j?.tokens) ? j.tokens : []
      const rel = tokens.find((t: any) => String(t?.token_id) === '0.0.7284519')
      setNeedAssociate(!rel)
      if (rel && typeof rel.balance === 'number') {
        const decimals = typeof rel.decimals === 'number' ? rel.decimals : 0
        const human = decimals > 0 ? (rel.balance / Math.pow(10, decimals)) : rel.balance
        setCokBalance(String(human))
      } else {
        setCokBalance('0')
      }
    } catch { setCokBalance('') } finally { setCokLoading(false) }
  }

  async function handleMint() {
    if (!accountId) return
    setMinting(true)
    setStatus('')
    try {
      const tinyAmount = Number(process.env.NEXT_PUBLIC_COK_MINT_TINY_AMOUNT || '0') || undefined
      const out = await mintCokToken(accountId, tinyAmount)
      if (out && out.error) {
        const msg = String(out.error || '')
        if (msg.includes('TOKEN_NOT_ASSOCIATED')) setNeedAssociate(true)
        throw new Error(msg)
      }
      {
        const tid = `${Date.now()}-${Math.random()}`
        setToasts(t => [...t, { id: tid, text: 'Minted $COK successfully', kind: 'success' }])
        setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 3000)
      }
      await refreshCok()
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (e: any) {
      setStatus(e?.message || 'Mint failed')
      {
        const tid = `${Date.now()}-${Math.random()}`
        setToasts(t => [...t, { id: tid, text: e?.message || 'Mint failed', kind: 'error' }])
        setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 4000)
      }
    } finally {
      setMinting(false)
    }
  }

  async function openWallet() {
    try {
      const mod: any = await import('hashconnect')
      const sdk: any = await import('@hashgraph/sdk')
      const HashConnect = mod.HashConnect || mod.default
      const LedgerId = sdk.LedgerId || sdk.default?.LedgerId
      const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID
      const network = process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet'
      if (!projectId) throw new Error('Missing NEXT_PUBLIC_WC_PROJECT_ID')
      const ledger = network === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET
      const appMetadata = { name: 'Debate Arena AI', description: 'Agent-to-Agent Debate Arena', icons: [], url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000' }
      const hc = new HashConnect(ledger, projectId, appMetadata, false)
      await hc.init()
      hc.openPairingModal()
      {
        const tid = `${Date.now()}-${Math.random()}`
        setToasts(t => [...t, { id: tid, text: 'Open your wallet and associate token 0.0.7284519', kind: 'info' }])
        setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 4000)
      }
    } catch (e: any) {
      setStatus(e?.message || 'Open wallet failed')
    }
  }

  async function regenerateCustodial() {
    try {
      const { data: sessData } = await supabase.auth.getSession()
      const uid = sessData?.session?.user?.id
      const email = (sessData?.session?.user as any)?.email || (sessData?.session?.user as any)?.user_metadata?.email || ''
      if (!uid) throw new Error('Not signed in')
      const out = await createCustodialAccount(uid, email, 'google')
      if (out && out.error) throw new Error(out.error)
      const accIdNew = String(out?.accountId || '')
      if (!accIdNew) throw new Error('Custodial creation failed')
      try { sessionStorage.setItem('accountId', accIdNew) } catch {}
      setAccountId(accIdNew)
      await refreshCok()
      setNeedAssociate(false)
      {
        const tid = `${Date.now()}-${Math.random()}`
        setToasts(t => [...t, { id: tid, text: 'Custodial wallet regenerated and associated', kind: 'success' }])
        setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 3000)
      }
    } catch (e: any) {
      setStatus(e?.message || 'Regenerate failed')
      {
        const tid = `${Date.now()}-${Math.random()}`
        setToasts(t => [...t, { id: tid, text: e?.message || 'Regenerate failed', kind: 'error' }])
        setTimeout(() => { setToasts(t => t.filter(x => x.id !== tid)) }, 4000)
      }
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
        <div className="card p-4 space-y-3">
          <div className="label">Account</div>
          <div className="flex items-center justify-between">
            <div className="font-mono text-sm">{accountId || '-'}</div>
            <span className="badge bg-white border text-brand-brown/80">Hedera</span>
          </div>
          <div className="space-y-1">
            <div className="label">$COK Token</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{cokLoading ? 'Loading…' : (cokBalance || '0')}</div>
              <span className="badge font-mono">0.0.7284519</span>
            </div>
            {!cokLoading && !needAssociate && (Number(cokBalance || '0') === 0) && (
              <div className="mt-2 flex items-center justify-end">
                <button className={`btn-secondary btn-sm ${minting ? 'bg-gray-200 text-gray-500 hover:bg-gray-200 cursor-not-allowed' : ''}`} onClick={handleMint} disabled={minting}>Mint $COK</button>
              </div>
            )}
            {(!cokLoading && needAssociate) && (
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-brand-brown/60">Token not associated. Please open wallet to associate token 0.0.7284519.</div>
                <div className="flex items-center gap-2">
                  <button className="btn-outline btn-sm" onClick={openWallet}>Open</button>
                </div>
              </div>
            )}
          </div>
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
