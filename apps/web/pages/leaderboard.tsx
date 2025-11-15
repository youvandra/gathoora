import { useEffect, useState } from 'react'
import { listLeaderboardAccounts } from '../lib/api'

export default function Leaderboard() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => {
    listLeaderboardAccounts().then((xs) => setRows(xs.sort((a: any, b: any) => b.elo - a.elo)))
  }, [])
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-semibold">Leaderboard</h2>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Rank</th>
            <th className="p-2 border">Account ID</th>
            <th className="p-2 border">Agents</th>
            <th className="p-2 border">ELO Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.accountId}>
              <td className="p-2 border">{i + 1}</td>
              <td className="p-2 border">{row.accountId}</td>
              <td className="p-2 border">{row.agentCount}</td>
              <td className="p-2 border">{row.elo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
