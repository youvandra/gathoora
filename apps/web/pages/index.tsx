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
    const acc = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null
    if (acc) {
      setConnected(true)
      setAccountId(acc)
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
    const hc = new HashConnect(ledger, projectId, appMetadata, true)
    w.__hashconnect = hc
    return hc
  }

  async function handleConnect() {
    if (connectingRef.current) return
    connectingRef.current = true
    setStatus('Connecting wallet...')
    let hc: any
    try {
      hc = await getHashConnect()
    } catch (e: any) {
      setStatus(e?.message || 'HashConnect init error')
      connectingRef.current = false
      return
    }
    try {
      hc.pairingEvent.once(async (data: any) => {
        const accId = (data?.accountIds?.[0] || '').toString()
        const topic = data?.topic || ''
        if (!accId) {
          setStatus('Connected but account not found')
          connectingRef.current = false
          return
        }
        try { localStorage.setItem('hcTopic', topic) } catch {}
        localStorage.setItem('accountId', accId)
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
      await hc.init()
      hc.openPairingModal()
    } catch (e: any) {
      setStatus(e?.message || 'Connect error')
      connectingRef.current = false
    }
  }

  async function handleDisconnect() {
    try {
      const topic = typeof window !== 'undefined' ? localStorage.getItem('hcTopic') : null
      const hc = await getHashConnect()
      if (topic) {
        try { await hc.disconnect(topic) } catch {}
      }
    } catch {}
    try { localStorage.removeItem('hcTopic') } catch {}
    try { localStorage.removeItem('accountId') } catch {}
    setConnected(false)
    setAccountId('')
    setStatus('')
    setQr('')
  }
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold">Debate Arena AI</h1>
        <div className="space-y-4">
          {connected ? (
            <>
              <div className="text-sm text-gray-700">Wallet: {accountId}</div>
              <button className="px-3 py-1 text-sm border" onClick={handleDisconnect}>Disconnect</button>
              <div className="space-x-4">
                <Link href="/packs" className="px-4 py-2 bg-blue-600 text-white rounded">Packs</Link>
                <Link href="/arena" className="px-4 py-2 bg-green-600 text-white rounded">Arena</Link>
                <Link href="/leaderboard" className="px-4 py-2 bg-gray-700 text-white rounded">Leaderboard</Link>
              </div>
            </>
          ) : (
            <>
              <button className="px-4 py-2 bg-purple-600 text-white rounded" onClick={handleConnect}>Connect Wallet</button>
              {status && <div className="text-sm text-gray-700">{status}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
