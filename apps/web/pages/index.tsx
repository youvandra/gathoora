import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import SignClient from '@walletconnect/sign-client'
import QRCode from 'qrcode'
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

  async function getSignClient() {
    const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID
    const relayUrl = process.env.NEXT_PUBLIC_WC_RELAY_URL || 'wss://relay.walletconnect.com'
    if (!projectId) throw new Error('Missing NEXT_PUBLIC_WC_PROJECT_ID')
    const w: any = typeof window !== 'undefined' ? window : {}
    if (w.__wc_client) return w.__wc_client
    const client = await SignClient.init({
      projectId,
      relayUrl,
      metadata: { name: 'Debate Arena AI', description: 'Agent-to-Agent Debate Arena', url: 'http://localhost:3000', icons: [] }
    })
    w.__wc_client = client
    return client
  }

  async function handleConnect() {
    if (connectingRef.current) return
    connectingRef.current = true
    setStatus('Connecting wallet...')
    const network = process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet'
    let client
    try {
      client = await getSignClient()
    } catch (e: any) {
      setStatus(e.message || 'WalletConnect init error')
      connectingRef.current = false
      return
    }
    const { uri, approval } = await client.connect({
      optionalNamespaces: {
        hedera: {
          methods: ['hedera_signMessage', 'hedera_signTransaction'],
          chains: [`hedera:${network}`],
          events: ['accountsChanged', 'chainChanged']
        }
      }
    })
    if (uri) {
      const link = `https://hashpack.app/wc?uri=${encodeURIComponent(uri)}`
      const el = document.getElementById('wc-link')
      if (el) el.setAttribute('href', link)
      try {
        const dataUrl = await QRCode.toDataURL(uri)
        setQr(dataUrl)
      } catch {}
      setStatus('Open HashPack and approve connection')
    }
    const session = await approval()
    const ns = session.namespaces['hedera']
    const acct = ns?.accounts?.[0] || ''
    const parts = acct.split(':')
    const accId = parts[2] || ''
    if (!accId) {
      setStatus('Connected but account not found')
      connectingRef.current = false
      return
    }
    try { localStorage.setItem('wcTopic', (session as any).topic) } catch {}
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
  }

  async function handleDisconnect() {
    try {
      const topic = typeof window !== 'undefined' ? localStorage.getItem('wcTopic') : null
      const client = await getSignClient()
      if (topic) {
        try {
          await (client as any).disconnect({ topic })
        } catch {}
      }
    } catch {}
    try { localStorage.removeItem('wcTopic') } catch {}
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
              <div className="space-y-2">
                <a id="wc-link" className="text-sm text-purple-700 underline" href="#" target="_blank" rel="noreferrer">Open HashPack WalletConnect</a>
                {qr && (
                  <div className="flex justify-center"><img src={qr} alt="WalletConnect QR" className="border p-2" /></div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
