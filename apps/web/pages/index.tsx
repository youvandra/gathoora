import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [connected, setConnected] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [status, setStatus] = useState('')
  const [qr, setQr] = useState('')
  const connectingRef = useRef(false)
  useEffect(() => {
    const acc = typeof window !== 'undefined' ? sessionStorage.getItem('accountId') : null
    if (acc) {
      setAccountId(acc)
      setConnected(true)
      setStatus('Connected')
    }
  }, [])

  async function getHashConnect() {
    const w: any = typeof window !== 'undefined' ? window : {}
    if (w.__hashconnect) return w.__hashconnect
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
    w.__hashconnect = hc
    return hc
  }

  async function getFreshHashConnect() {
    const mod: any = await import('hashconnect')
    const sdk: any = await import('@hashgraph/sdk')
    const HashConnect = mod.HashConnect || mod.default
    const LedgerId = sdk.LedgerId || sdk.default?.LedgerId
    const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID
    const network = process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet'
    if (!projectId) throw new Error('Missing NEXT_PUBLIC_WC_PROJECT_ID')
    const ledger = network === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET
    const appMetadata = { 
      name: 'Debate Arena AI', 
      description: 'Agent-to-Agent Debate Arena', 
      icons: [], 
      url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000' 
    }

    const hc = new HashConnect(ledger, projectId, appMetadata, false)
    await hc.init()
    return hc
  }


  async function handleConnect() {
    if (connectingRef.current) return
    connectingRef.current = true
    setStatus('Connecting wallet...')

    let hc: any
    try {
      hc = await getFreshHashConnect() // fresh instance
    } catch (e: any) {
      setStatus(e?.message || 'HashConnect init error')
      connectingRef.current = false
      return
    }

    hc.pairingEvent.once(async (data: any) => {
      const ids: string[] = Array.isArray(data?.accountIds) ? data.accountIds.map(String) : []
      const accId = ids[ids.length - 1] || ''
      const topic = data?.topic || ''

      if (!accId) {
        setStatus('Connected but account not found')
        connectingRef.current = false
        return
      }

      sessionStorage.setItem('hcTopic', topic)
      sessionStorage.setItem('accountId', accId)
      setAccountId(accId)
      setConnected(true)
      setStatus('Connected')

      try {
        const { data: existing } = await supabase.from('users').select('*').eq('account_id', accId).maybeSingle()
        if (!existing) {
          await supabase.from('users').insert({ account_id: accId, name: `User-${accId}` })
        }
      } catch {}

      connectingRef.current = false
    })

    try {
      hc.openPairingModal()
    } catch (e: any) {
      setStatus(e?.message || 'Connect error')
      connectingRef.current = false
    }
  }



  async function handleDisconnect() {
    try {
      const topic = typeof window !== 'undefined' ? sessionStorage.getItem('hcTopic') : null
      const hc = await getHashConnect()
      if (topic) {
        try { await hc.disconnect(topic) } catch {}
      }
    } catch {}
    try { sessionStorage.removeItem('hcTopic') } catch {}
    try { sessionStorage.removeItem('accountId') } catch {}
    setConnected(false)
    setAccountId('')
    setStatus('')
    setQr('')
  }
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="page">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold leading-tight">Navigating Ideas, Sharing Insights.</h1>
            <p className="text-brand-brown">Unlock invaluable wisdom personalized for you in our agent debate arena. Dive into episodes designed to deliver relevant insights that cater to your interests and needs.</p>
            <div className="flex gap-3">
              {connected ? (
                <>
                  <Link href="/arena" className="btn-primary">Enter Arena</Link>
                  <Link href="/packs" className="btn-outline">Manage Packs</Link>
                </>
              ) : (
                <button className="btn-primary" onClick={handleConnect}>Connect Wallet</button>
              )}
            </div>
            {status && !connected && <div className="text-sm">{status}</div>}
            {connected && <div className="text-sm">Wallet: <span className="font-mono">{accountId}</span></div>}
            {connected && <button className="btn-outline text-sm" onClick={handleDisconnect}>Disconnect</button>}
          </div>
          <div className="hidden md:block">
            <div className="card-lg">
              <div className="grid grid-cols-3 gap-4">
                <div className="h-24 rounded-xl bg-brand-yellow"></div>
                <div className="h-24 rounded-xl bg-brand-blue"></div>
                <div className="h-24 rounded-xl bg-brand-peach"></div>
                <div className="h-24 rounded-xl bg-brand-coral"></div>
                <div className="h-24 rounded-xl bg-brand-green"></div>
                <div className="h-24 rounded-xl bg-brand-brown"></div>
              </div>
            </div>
          </div>
        </div>
        {connected ? (
          <>
              
          </>
        ) : (
          <>
              
          </>
        )}
      </div>
    </div>
  )
}
