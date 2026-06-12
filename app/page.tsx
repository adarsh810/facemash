'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

interface BlendItem {
  id: string
  mixed_photo_url: string
  round_number: number
  game_code: string
  player_names: string[]
  likes_count: number
  user_liked: boolean
  created_at: string
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('fm_session_id')
  if (!id) {
    id = uuidv4()
    localStorage.setItem('fm_session_id', id)
  }
  return id
}

function getPlayedCodes(): string[] {
  if (typeof window === 'undefined') return []
  return JSON.parse(localStorage.getItem('fm_played_games') || '[]')
}

function trackPlayedGame(code: string) {
  const existing = getPlayedCodes()
  if (!existing.includes(code.toUpperCase())) {
    localStorage.setItem(
      'fm_played_games',
      JSON.stringify([...existing, code.toUpperCase()])
    )
  }
}

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home')
  const [rounds, setRounds] = useState<3 | 5>(3)
  const [joinName, setJoinName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [hostName, setHostName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Blends gallery
  const [blends, setBlends] = useState<BlendItem[]>([])
  const [blendsLoading, setBlendsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [playedCodes, setPlayedCodes] = useState<string[]>([])
  const [clearingPhotos, setClearingPhotos] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('fm_game_code')
    if (saved) setJoinCode(saved)
    const codes = getPlayedCodes()
    setPlayedCodes(codes)
  }, [])

  const fetchBlends = useCallback(
    async (cursor: string | null, replace: boolean) => {
      if (playedCodes.length === 0) return
      setBlendsLoading(true)
      try {
        const sid = getOrCreateSessionId()
        const params = new URLSearchParams({
          codes: playedCodes.join(','),
          limit: '12',
          sessionId: sid,
        })
        if (cursor) params.set('before', cursor)
        const res = await fetch(`/api/fm/blends?${params}`)
        const data = await res.json()
        setBlends((prev) => (replace ? data.blends : [...prev, ...data.blends]))
        setHasMore(data.hasMore)
        setNextCursor(data.nextCursor)
      } finally {
        setBlendsLoading(false)
      }
    },
    [playedCodes]
  )

  // Load blends on mount when codes are available
  useEffect(() => {
    if (playedCodes.length > 0) {
      fetchBlends(null, true)
      // Backfill any fal.ai CDN URLs in the background
      fetch('/api/fm/backfill-blends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCodes: playedCodes }),
      }).catch(() => {})
    }
  }, [playedCodes, fetchBlends])

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !blendsLoading) {
          fetchBlends(nextCursor, false)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, blendsLoading, nextCursor, fetchBlends])

  async function handleCreate() {
    if (!hostName.trim()) { setError('Enter your name first'); return }
    setLoading(true)
    setError('')
    try {
      const sessionId = getOrCreateSessionId()
      const res = await fetch('/api/fm/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rounds, sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create game')
      const { gameCode, playerId } = data
      localStorage.setItem('fm_game_code', gameCode)
      localStorage.setItem(`fm_player_id_${gameCode}`, playerId)
      localStorage.setItem(`fm_player_name_${gameCode}`, hostName.trim())
      trackPlayedGame(gameCode)
      await fetch(`/api/fm/games/${gameCode}/update-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, name: hostName.trim() }),
      })
      router.push(`/game/${gameCode}/lobby`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!joinName.trim()) { setError('Enter your name'); return }
    if (!joinCode.trim() || joinCode.trim().length !== 6) {
      setError('Enter a valid 6-character game code')
      return
    }
    setLoading(true)
    setError('')
    try {
      const sessionId = getOrCreateSessionId()
      const code = joinCode.trim().toUpperCase()
      const res = await fetch(`/api/fm/games/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: joinName.trim(), sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join game')
      const { playerId } = data
      localStorage.setItem('fm_game_code', code)
      localStorage.setItem(`fm_player_id_${code}`, playerId)
      localStorage.setItem(`fm_player_name_${code}`, joinName.trim())
      trackPlayedGame(code)
      router.push(`/game/${code}/lobby`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function toggleLike(blend: BlendItem) {
    const sessionId = getOrCreateSessionId()
    // Optimistic update
    setBlends((prev) =>
      prev.map((b) =>
        b.id === blend.id
          ? {
              ...b,
              user_liked: !b.user_liked,
              likes_count: b.user_liked ? b.likes_count - 1 : b.likes_count + 1,
            }
          : b
      )
    )
    await fetch('/api/fm/like-blend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mixId: blend.id, sessionId }),
    })
  }

  async function downloadBlend(url: string, names: string[]) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `facemash-${names.join('-')}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  async function shareBlend(url: string, names: string[]) {
    const text = `AI blend of ${names.join(' + ')} from Facemash 🎭`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Facemash Blend', text, url })
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
      alert('Link copied!')
    }
  }

  async function handleClearPhotos() {
    if (
      !confirm(
        'Delete all input photos from past games? Blended images will be kept. This cannot be undone.'
      )
    )
      return
    setClearingPhotos(true)
    try {
      await fetch('/api/fm/clear-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCodes: playedCodes }),
      })
    } finally {
      setClearingPhotos(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4 pt-8 pb-24">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(255,45,107,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(123,47,255,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">🎭</div>
          <h1 className="text-5xl font-black tracking-tight mb-2">
            <span style={{ color: '#FF2D6B' }}>Face</span>
            <span>mash</span>
          </h1>
          <p style={{ color: '#A0A0A0' }} className="text-lg font-medium">
            Mix faces. Guess who. Chaos guaranteed.
          </p>
        </div>

        {mode === 'home' && (
          <div className="space-y-3">
            <button
              onClick={() => { setMode('create'); setError('') }}
              className="w-full py-5 rounded-2xl text-xl font-bold transition-all duration-200 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #FF2D6B, #FF6B35)',
                boxShadow: '0 0 30px rgba(255,45,107,0.3)',
              }}
            >
              🎉 Create Game
            </button>
            <button
              onClick={() => { setMode('join'); setError('') }}
              className="w-full py-5 rounded-2xl text-xl font-bold transition-all duration-200 active:scale-95 border-2"
              style={{
                background: 'transparent',
                borderColor: '#7B2FFF',
                color: '#ffffff',
                boxShadow: '0 0 20px rgba(123,47,255,0.2)',
              }}
            >
              🎮 Join Game
            </button>

            <div
              className="mt-2 p-4 rounded-2xl text-center"
              style={{ background: '#141414', border: '1px solid #2A2A2A' }}
            >
              <p style={{ color: '#A0A0A0' }} className="text-sm">
                🎲 4–15 players &nbsp;·&nbsp; 📸 Upload selfies &nbsp;·&nbsp; 🤖 AI blends faces
              </p>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <h2 className="text-2xl font-bold">Create Game 🎉</h2>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#A0A0A0' }}>Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                maxLength={20}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-[#555] outline-none transition-all"
                style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
                onFocus={(e) => (e.target.style.borderColor = '#FF2D6B')}
                onBlur={(e) => (e.target.style.borderColor = '#2A2A2A')}
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#A0A0A0' }}>Number of Rounds</label>
              <div className="flex gap-3">
                {([3, 5] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRounds(r)}
                    className="flex-1 py-3 rounded-xl font-bold text-lg transition-all"
                    style={{
                      background: rounds === r ? '#FF2D6B' : '#1E1E1E',
                      border: `2px solid ${rounds === r ? '#FF2D6B' : '#2A2A2A'}`,
                    }}
                  >
                    {r} Rounds
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setMode('home'); setError('') }}
                className="flex-1 py-3 rounded-xl font-semibold transition-all"
                style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#FF2D6B' }}
              >
                {loading ? '⏳ Creating...' : 'Create →'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <h2 className="text-2xl font-bold">Join Game 🎮</h2>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#A0A0A0' }}>Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-[#555] outline-none transition-all"
                style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
                onFocus={(e) => (e.target.style.borderColor = '#7B2FFF')}
                onBlur={(e) => (e.target.style.borderColor = '#2A2A2A')}
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#A0A0A0' }}>Game Code</label>
              <input
                type="text"
                placeholder="XXXXXX"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-[#555] outline-none transition-all text-2xl font-bold tracking-widest text-center"
                style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
                onFocus={(e) => (e.target.style.borderColor = '#7B2FFF')}
                onBlur={(e) => (e.target.style.borderColor = '#2A2A2A')}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setMode('home'); setError('') }}
                className="flex-1 py-3 rounded-xl font-semibold transition-all"
                style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
              >
                Back
              </button>
              <button
                onClick={handleJoin}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#7B2FFF' }}
              >
                {loading ? '⏳ Joining...' : 'Join →'}
              </button>
            </div>
          </div>
        )}

        {/* Past blends gallery */}
        {mode === 'home' && playedCodes.length > 0 && (
          <div className="mt-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">🎭 Blended Images</h2>
              <button
                onClick={handleClearPhotos}
                disabled={clearingPhotos}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#1E1E1E', border: '1px solid #3A3A3A', color: '#666' }}
              >
                {clearingPhotos ? 'Clearing...' : 'Clear Input Images'}
              </button>
            </div>

            {blends.length === 0 && !blendsLoading && (
              <div
                className="p-6 rounded-2xl text-center"
                style={{ background: '#141414', border: '1px solid #2A2A2A' }}
              >
                <p style={{ color: '#555' }} className="text-sm">
                  No blended images yet. Play a game to see them here.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {blends.map((blend) => (
                <div
                  key={blend.id}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: '#141414', border: '1px solid #2A2A2A' }}
                >
                  <div style={{ aspectRatio: '1' }}>
                    <img
                      src={blend.mixed_photo_url}
                      alt={blend.player_names.join(' + ')}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2.5 space-y-2">
                    <div>
                      <p className="text-xs font-bold truncate">{blend.player_names.join(' + ')}</p>
                      <p className="text-xs" style={{ color: '#555' }}>
                        {blend.game_code} · R{blend.round_number}
                      </p>
                    </div>
                    {/* Like + Share + Download */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleLike(blend)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                        style={{
                          background: blend.user_liked ? 'rgba(255,45,107,0.15)' : '#1E1E1E',
                          border: `1px solid ${blend.user_liked ? '#FF2D6B' : '#2A2A2A'}`,
                          color: blend.user_liked ? '#FF2D6B' : '#A0A0A0',
                        }}
                      >
                        {blend.user_liked ? '❤️' : '🤍'} {blend.likes_count}
                      </button>
                      <button
                        onClick={() => shareBlend(blend.mixed_photo_url, blend.player_names)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 text-center"
                        style={{ background: '#1E1E1E', border: '1px solid #2A2A2A', color: '#A0A0A0' }}
                      >
                        📤
                      </button>
                      <button
                        onClick={() => downloadBlend(blend.mixed_photo_url, blend.player_names)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 text-center"
                        style={{ background: '#1E1E1E', border: '1px solid #2A2A2A', color: '#A0A0A0' }}
                      >
                        ⬇️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {blendsLoading && (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 rounded-full border-2 border-[#FF2D6B] border-t-transparent animate-spin" />
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />
          </div>
        )}
      </div>
    </main>
  )
}
