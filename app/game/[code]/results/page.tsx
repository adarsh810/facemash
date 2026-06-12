'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Player, RoundMix } from '@/lib/types'

interface PlayerScore {
  player: Player
  score: number
}

export default function ResultsPage() {
  const router = useRouter()
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([])
  const [mixedPhotos, setMixedPhotos] = useState<RoundMix[]>([])
  const [isHost, setIsHost] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [resetting, setResetting] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])

  const loadResults = useCallback(async () => {
    const { data: gameRaw } = await supabase
      .from('fm_games')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    const game = gameRaw as { id: string; host_session_id: string; status: string } | null
    if (!game) return

    const sid = localStorage.getItem('fm_session_id') || ''
    setIsHost(game.host_session_id === sid)

    const { data: playerRaw } = await supabase
      .from('fm_players')
      .select('*')
      .eq('game_id', game.id)
      .order('created_at', { ascending: true })

    const playerData = (playerRaw || []) as Player[]
    setPlayers(playerData)

    // Get all mixes
    const { data: mixesRaw } = await supabase
      .from('fm_round_mixes')
      .select('*')
      .eq('game_id', game.id)
      .eq('status', 'ready')
      .order('round_number', { ascending: true })
      .order('pic_index', { ascending: true })

    const mixes = (mixesRaw || []) as RoundMix[]
    setMixedPhotos(mixes)

    // Get all guesses
    const { data: allMixesRaw } = await supabase
      .from('fm_round_mixes')
      .select('id')
      .eq('game_id', game.id)

    const allMixes = (allMixesRaw || []) as { id: string }[]
    const mixIds = allMixes.map((m) => m.id)

    const { data: allGuessesRaw } = await supabase
      .from('fm_guesses')
      .select('player_id, score')
      .in('round_mix_id', mixIds)

    const allGuesses = (allGuessesRaw || []) as { player_id: string; score: number }[]

    const scoreMap: Record<string, number> = {}
    for (const g of allGuesses) {
      scoreMap[g.player_id] = (scoreMap[g.player_id] || 0) + g.score
    }

    const scores: PlayerScore[] = playerData.map((p) => ({
      player: p as Player,
      score: scoreMap[p.id] || 0,
    }))

    scores.sort((a, b) => b.score - a.score)
    setPlayerScores(scores)
  }, [code])

  useEffect(() => {
    const sid = localStorage.getItem('fm_session_id') || ''
    setSessionId(sid)
    loadResults()
  }, [loadResults])

  async function handleReset() {
    setResetting(true)
    try {
      const res = await fetch(`/api/fm/games/${code}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (res.ok) {
        router.push(`/game/${code}/lobby`)
      } else {
        const d = await res.json()
        alert(d.error || 'Reset failed')
      }
    } finally {
      setResetting(false)
    }
  }

  async function downloadPhoto(url: string, index: number) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `facemash-blend-${index + 1}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  async function sharePhoto(url: string, mix: RoundMix) {
    const playerNames = mix.player_ids
      .map((pid) => players.find((p) => p.id === pid)?.name || 'Unknown')
      .join(' + ')

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Facemash Blend',
          text: `Check out this AI blend of ${playerNames} from our Facemash game! 🎭`,
          url,
        })
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url)
      alert('Link copied to clipboard!')
    }
  }

  function getPlayerName(pid: string) {
    return players.find((p) => p.id === pid)?.name || 'Unknown'
  }

  const podium = playerScores.slice(0, 3)
  const rest = playerScores.slice(3)

  return (
    <main className="min-h-screen flex flex-col items-center p-4 pt-8 pb-24">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(255,45,107,0.1) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="text-5xl mb-2">🏆</div>
          <h1 className="text-3xl font-black">Final Results!</h1>
          <p style={{ color: '#A0A0A0' }} className="text-sm mt-1">
            The faces have been guessed
          </p>
        </div>

        {/* Podium */}
        {podium.length > 0 && (
          <div
            className="rounded-2xl p-5"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <h2 className="font-bold text-center mb-4 text-lg">🎖️ Podium</h2>

            {/* First place */}
            {podium[0] && (
              <div
                className="flex items-center gap-4 p-4 rounded-2xl mb-3"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,0,0.1))',
                  border: '2px solid rgba(255,215,0,0.4)',
                }}
              >
                <div className="text-4xl">🥇</div>
                <div className="flex-1">
                  <p className="font-black text-xl">{podium[0].player.name}</p>
                  {podium[0].player.is_host && (
                    <p style={{ color: '#A0A0A0' }} className="text-xs">Host</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black" style={{ color: '#FFD700' }}>
                    {podium[0].score}
                  </p>
                  <p style={{ color: '#A0A0A0' }} className="text-xs">points</p>
                </div>
              </div>
            )}

            {/* 2nd and 3rd */}
            <div className="flex gap-3">
              {podium[1] && (
                <div
                  className="flex-1 p-3 rounded-xl"
                  style={{
                    background: 'rgba(192,192,192,0.1)',
                    border: '1px solid rgba(192,192,192,0.3)',
                  }}
                >
                  <div className="text-2xl mb-1">🥈</div>
                  <p className="font-bold text-sm">{podium[1].player.name}</p>
                  <p className="font-black text-lg" style={{ color: '#C0C0C0' }}>
                    {podium[1].score} <span className="text-xs font-normal">pts</span>
                  </p>
                </div>
              )}
              {podium[2] && (
                <div
                  className="flex-1 p-3 rounded-xl"
                  style={{
                    background: 'rgba(205,127,50,0.1)',
                    border: '1px solid rgba(205,127,50,0.3)',
                  }}
                >
                  <div className="text-2xl mb-1">🥉</div>
                  <p className="font-bold text-sm">{podium[2].player.name}</p>
                  <p className="font-black text-lg" style={{ color: '#CD7F32' }}>
                    {podium[2].score} <span className="text-xs font-normal">pts</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rest of leaderboard */}
        {rest.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <h2 className="font-bold mb-3">Full Rankings</h2>
            <div className="space-y-2">
              {rest.map((ps, i) => (
                <div
                  key={ps.player.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
                >
                  <span style={{ color: '#A0A0A0' }} className="w-6 text-center font-bold text-sm">
                    {i + 4}.
                  </span>
                  <span className="flex-1 font-medium">{ps.player.name}</span>
                  <span className="font-bold" style={{ color: '#A0A0A0' }}>
                    {ps.score} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mixed photos gallery */}
        {mixedPhotos.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <h2 className="font-bold mb-3">🎭 All Blended Photos</h2>
            <div className="grid grid-cols-2 gap-3">
              {mixedPhotos.map((mix, i) => (
                <div
                  key={mix.id}
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid #2A2A2A' }}
                >
                  <div style={{ aspectRatio: '1' }} className="relative">
                    {mix.mixed_photo_url && (
                      <img
                        src={mix.mixed_photo_url}
                        alt={`Blend ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-xs font-medium" style={{ color: '#A0A0A0' }}>
                      R{mix.round_number} · {mix.player_ids.map(getPlayerName).join(' + ')}
                    </p>
                    <div className="flex gap-1.5">
                      {mix.mixed_photo_url && (
                        <>
                          <button
                            onClick={() => downloadPhoto(mix.mixed_photo_url!, i)}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                            style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
                          >
                            ⬇️ Save
                          </button>
                          <button
                            onClick={() => sharePhoto(mix.mixed_photo_url!, mix)}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                            style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
                          >
                            📤 Share
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Play again */}
        {isHost && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="w-full py-5 rounded-2xl text-xl font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #FF2D6B, #FF6B35)',
              boxShadow: '0 0 30px rgba(255,45,107,0.3)',
            }}
          >
            {resetting ? '⏳ Resetting...' : '🔄 Play Again'}
          </button>
        )}

        <button
          onClick={() => router.push('/')}
          className="w-full py-3 rounded-2xl font-semibold transition-all"
          style={{ background: '#141414', border: '1px solid #2A2A2A', color: '#A0A0A0' }}
        >
          🏠 Back to Home
        </button>
      </div>
    </main>
  )
}
