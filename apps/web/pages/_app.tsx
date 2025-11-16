import type { AppProps } from 'next/app'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import '../styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const [accountId, setAccountId] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const acc = typeof window !== 'undefined' ? (sessionStorage.getItem('accountId') || '') : ''
    setAccountId(acc)
    setMenuOpen(false)
  }, [router.pathname])

  async function handleDisconnect() {
    try {
      const topic = typeof window !== 'undefined' ? sessionStorage.getItem('hcTopic') : null
      if (topic) {
        const mod: any = await import('hashconnect')
        const sdk: any = await import('@hashgraph/sdk')
        const HashConnect = mod.HashConnect || mod.default
        const LedgerId = sdk.LedgerId || sdk.default?.LedgerId
        const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID
        const network = process.env.NEXT_PUBLIC_HASHPACK_NETWORK || 'testnet'
        const ledger = network === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET
        const appMetadata = { name: 'Debate Arena AI', description: 'Agent-to-Agent Debate Arena', icons: [], url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000' }
        const hc = new HashConnect(ledger, projectId, appMetadata, false)
        try { await hc.disconnect(topic) } catch {}
      }
    } catch {}
    try { sessionStorage.removeItem('hcTopic') } catch {}
    try { sessionStorage.removeItem('accountId') } catch {}
    setAccountId('')
    setMenuOpen(false)
    if (router.pathname !== '/') router.push('/')
  }

  return (
    <div>
      {router.pathname !== '/' && (
        <header className="nav">
          <div className="nav-inner">
            <Link href="/" className="brand">
              <span className="brand-dot" />
              <span>Debate Arena AI</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="nav-links">
                <Link href="/packs" className={`nav-link ${router.pathname.startsWith('/packs')?'bg-brand-cream':''}`}>Packs</Link>
                <Link href="/arena" className={`nav-link ${router.pathname.startsWith('/arena')?'bg-brand-cream':''}`}>Arena</Link>
                <Link href="/leaderboard" className={`nav-link ${router.pathname.startsWith('/leaderboard')?'bg-brand-cream':''}`}>Leaderboard</Link>
              </div>
              <div className="relative">
                {accountId ? (
                  <button className="btn-outline text-sm" onClick={()=> setMenuOpen(o=>!o)}>
                    Wallet {accountId.length>0 ? (accountId) : ''}
                  </button>
                ) : (
                  <Link href="/" className="btn-outline text-sm">Connect</Link>
                )}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 card p-2 w-44">
                    <button className="btn-ghost btn-sm w-full" onClick={handleDisconnect}>Disconnect</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}
      <main>
        <Component {...pageProps} />
      </main>
    </div>
  )
}
