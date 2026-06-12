'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { useTheme } from '@/components/ThemeProvider'

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
  const { theme, toggle } = useTheme()
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home')
  const [rounds, setRounds] = useState<3 | 5>(3)
  const [joinName, setJoinName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [hostName, setHostName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playedCodes, setPlayedCodes] = useState<string[]>([])
  const [clearingPhotos, setClearingPhotos] = useState(false)
  const [clearingBlends, setClearingBlends] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('fm_game_code')
    if (saved) {
      setJoinCode(saved)
      trackPlayedGame(saved)
    }
    setPlayedCodes(getPlayedCodes())
  }, [])

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

  async function handleClearPhotos() {
    if (!confirm('Delete all input photos from past games? Blended images will be kept. This cannot be undone.')) return
    setSettingsOpen(false)
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

  async function handleClearBlends() {
    if (!confirm('Delete all blended images from past games? This cannot be undone.')) return
    setSettingsOpen(false)
    setClearingBlends(true)
    try {
      await fetch('/api/fm/clear-blends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCodes: playedCodes }),
      })
    } finally {
      setClearingBlends(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4 pt-8 pb-24">
      {/* Ambient background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(255,45,107,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(123,47,255,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Settings gear — top right, home screen only */}
        {mode === 'home' && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="absolute top-0 right-0 p-2 rounded-full transition-all active:scale-95"
            style={{ color: 'var(--muted)' }}
            aria-label="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">🎭</div>
          <h1 className="text-5xl font-black tracking-tight mb-2">
            <span style={{ color: '#FF2D6B' }}>Face</span>
            <span style={{ color: 'var(--foreground)' }}>mash</span>
          </h1>
          <p style={{ color: 'var(--muted)' }} className="text-lg font-medium">
            Mix faces. Guess who. Chaos guaranteed.
          </p>
        </div>

        {mode === 'home' && (
          <div className="space-y-3">
            <button
              onClick={() => { setMode('create'); setError('') }}
              className="w-full py-5 rounded-2xl text-xl font-bold text-white transition-all duration-200 active:scale-95"
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
                color: 'var(--foreground)',
                boxShadow: '0 0 20px rgba(123,47,255,0.2)',
              }}
            >
              🎮 Join Game
            </button>

            <div
              className="mt-2 p-4 rounded-2xl text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <p style={{ color: 'var(--muted)' }} className="text-sm">
                🎲 4–15 players &nbsp;·&nbsp; 📸 Upload selfies &nbsp;·&nbsp; 🤖 AI blends faces
              </p>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Create Game 🎉</h2>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--muted)' }}>Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                maxLength={20}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#FF2D6B')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--muted)' }}>Number of Rounds</label>
              <div className="flex gap-3">
                {([3, 5] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRounds(r)}
                    className="flex-1 py-3 rounded-xl font-bold text-lg transition-all"
                    style={{
                      background: rounds === r ? '#FF2D6B' : 'var(--input-bg)',
                      border: `2px solid ${rounds === r ? '#FF2D6B' : 'var(--border)'}`,
                      color: rounds === r ? '#ffffff' : 'var(--foreground)',
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
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-bold text-white transition-all active:scale-95 disabled:opacity-50"
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
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Join Game 🎮</h2>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--muted)' }}>Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#7B2FFF')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--muted)' }}>Game Code</label>
              <input
                type="text"
                placeholder="XXXXXX"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all text-2xl font-bold tracking-widest text-center"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#7B2FFF')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setMode('home'); setError('') }}
                className="flex-1 py-3 rounded-xl font-semibold transition-all"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                Back
              </button>
              <button
                onClick={handleJoin}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#7B2FFF' }}
              >
                {loading ? '⏳ Joining...' : 'Join →'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Settings bottom sheet */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
          />
          <div
            className="relative w-full rounded-t-3xl p-6 pb-10 animate-slide-up"
            style={{
              background: 'var(--card)',
              borderTop: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              className="w-10 h-1 rounded-full mx-auto mb-6"
              style={{ background: 'var(--border)' }}
            />

            <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--foreground)' }}>
              Settings
            </h2>

            {/* Appearance */}
            <div className="mb-5">
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: 'var(--muted)' }}
              >
                Appearance
              </p>
              <div
                className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{theme === 'dark' ? '🌙' : '☀️'}</span>
                  <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </span>
                </div>
                {/* Toggle pill */}
                <button
                  onClick={toggle}
                  className="relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none flex-shrink-0"
                  style={{ background: theme === 'light' ? '#FF2D6B' : '#3A3A3A' }}
                  aria-label="Toggle theme"
                >
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300"
                    style={{ left: theme === 'light' ? '26px' : '4px' }}
                  />
                </button>
              </div>
            </div>

            {/* Data — only show if user has played games */}
            {playedCodes.length > 0 && (
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--muted)' }}
                >
                  Data
                </p>
                <div className="space-y-2">
                  <button
                    onClick={handleClearPhotos}
                    disabled={clearingPhotos}
                    className="w-full p-4 rounded-2xl text-left font-medium transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {clearingPhotos ? '⏳ Clearing...' : '🗑️ Clear Input Images'}
                  </button>
                  <button
                    onClick={handleClearBlends}
                    disabled={clearingBlends}
                    className="w-full p-4 rounded-2xl text-left font-medium transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {clearingBlends ? '⏳ Clearing...' : '🗑️ Clear Blended Images'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
