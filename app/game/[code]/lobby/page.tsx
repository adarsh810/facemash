'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Player } from '@/lib/types'

export default function LobbyPage() {
  const router = useRouter()
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [players, setPlayers] = useState<Player[]>([])
  const [isHost, setIsHost] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [myPlayerId, setMyPlayerId] = useState('')
  const [gameId, setGameId] = useState('')

  const loadPlayers = useCallback(async () => {
    const { data: gameRaw } = await supabase
      .from('fm_games')
      .select('id, host_session_id, status')
      .eq('code', code)
      .maybeSingle()

    const game = gameRaw as { id: string; host_session_id: string; status: string } | null
    if (!game) return

    if (game.status === 'uploading') {
      router.push(`/game/${code}/upload`)
      return
    }

    setGameId(game.id)

    const { data: playerData } = await supabase
      .from('fm_players')
      .select('*')
      .eq('game_id', game.id)
      .order('created_at', { ascending: true })

    if (playerData) setPlayers(playerData as Player[])

    const sid = localStorage.getItem('fm_session_id') || ''
    setSessionId(sid)
    setIsHost(game.host_session_id === sid)
  }, [code, router])

  useEffect(() => {
    const sid = localStorage.getItem('fm_session_id') || ''
    const pid = localStorage.getItem(`fm_player_id_${code}`) || ''
    setSessionId(sid)
    setMyPlayerId(pid)

    loadPlayers()
  }, [code, loadPlayers])

  // Set up realtime once we have the gameId
  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel(`lobby-${code}-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fm_players', filter: `game_id=eq.${gameId}` },
        () => { loadPlayers() }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fm_games', filter: `id=eq.${gameId}` },
        (payload) => {
          const game = payload.new as { status: string }
          if (game.status === 'uploading') {
            router.push(`/game/${code}/upload`)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, code, router, loadPlayers])

  async function handleStart() {
    setLoading(true)
    try {
      const res = await fetch(`/api/fm/games/${code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) {
        const d = await res.json()
        // Already started — just follow the redirect
        if (d.error === 'Game is not in lobby state') {
          router.push(`/game/${code}/upload`)
        } else {
          alert(d.error || 'Failed to start')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4 pt-12">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(123,47,255,0.1) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="text-4xl mb-2">🎭</div>
          <h1 className="text-3xl font-black">Game Lobby</h1>
          <p style={{ color: '#A0A0A0' }} className="text-sm mt-1">
            Share the code with your friends!
          </p>
        </div>

        {/* Game code */}
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: '#141414', border: '1px solid #2A2A2A' }}
        >
          <p style={{ color: '#A0A0A0' }} className="text-sm font-medium mb-2">GAME CODE</p>
          <div
            className="text-5xl font-black tracking-[0.2em] mb-4"
            style={{ color: '#FF2D6B' }}
          >
            {code}
          </div>
          <button
            onClick={handleCopy}
            className="px-6 py-2 rounded-xl font-semibold transition-all active:scale-95 text-sm"
            style={{
              background: copied ? '#1a3a1a' : '#1E1E1E',
              border: `1px solid ${copied ? '#22c55e' : '#2A2A2A'}`,
              color: copied ? '#22c55e' : '#fff',
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </button>
        </div>

        {/* Players list */}
        <div
          className="rounded-2xl p-4"
          style={{ background: '#141414', border: '1px solid #2A2A2A' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Players</h2>
            <span
              className="text-sm px-3 py-1 rounded-full"
              style={{ background: '#1E1E1E', color: '#A0A0A0' }}
            >
              {players.length} joined
            </span>
          </div>

          {players.length === 0 ? (
            <p style={{ color: '#A0A0A0' }} className="text-sm text-center py-4">
              Waiting for players to join...
            </p>
          ) : (
            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{
                    background: player.id === myPlayerId ? 'rgba(255,45,107,0.1)' : '#1E1E1E',
                    border: `1px solid ${player.id === myPlayerId ? '#FF2D6B' : '#2A2A2A'}`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      background: player.is_host
                        ? 'linear-gradient(135deg, #FF2D6B, #FF6B35)'
                        : '#7B2FFF',
                    }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{player.name}</span>
                  {player.is_host && (
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,45,107,0.2)', color: '#FF2D6B' }}
                    >
                      HOST
                    </span>
                  )}
                  {player.id === myPlayerId && !player.is_host && (
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(123,47,255,0.2)', color: '#7B2FFF' }}
                    >
                      YOU
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action area */}
        {isHost ? (
          <div className="space-y-3">
            {players.length < 2 ? (
              <div
                className="p-4 rounded-2xl text-center"
                style={{ background: '#141414', border: '1px solid #2A2A2A' }}
              >
                <p style={{ color: '#A0A0A0' }} className="text-sm">
                  Need at least 2 players to start
                </p>
              </div>
            ) : (
              <button
                onClick={handleStart}
                disabled={loading}
                className="w-full py-5 rounded-2xl text-xl font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #FF2D6B, #FF6B35)',
                  boxShadow: '0 0 30px rgba(255,45,107,0.3)',
                }}
              >
                {loading ? '⏳ Starting...' : 'Start Game →'}
              </button>
            )}
          </div>
        ) : (
          <div
            className="p-4 rounded-2xl text-center"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#FF2D6B] animate-pulse" />
              <p style={{ color: '#A0A0A0' }}>Waiting for host to start...</p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
