'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('fm_session_id')
  if (!id) {
    id = uuidv4()
    localStorage.setItem('fm_session_id', id)
  }
  return id
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

  useEffect(() => {
    const saved = localStorage.getItem('fm_game_code')
    if (saved) setJoinCode(saved)
  }, [])

  async function handleCreate() {
    if (!hostName.trim()) {
      setError('Enter your name first')
      return
    }
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

      // Update host name
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
    if (!joinName.trim()) {
      setError('Enter your name')
      return
    }
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

      router.push(`/game/${code}/lobby`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(255,45,107,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(123,47,255,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-slide-up">
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
              className="mt-8 p-4 rounded-2xl text-center"
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
                style={{
                  background: '#1E1E1E',
                  border: '1px solid #2A2A2A',
                }}
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
                    className="flex-1 py-3 rounded-xl font-bold text-lg transition-all duration-150"
                    style={{
                      background: rounds === r ? '#FF2D6B' : '#1E1E1E',
                      border: `2px solid ${rounds === r ? '#FF2D6B' : '#2A2A2A'}`,
                      color: '#fff',
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
      </div>
    </main>
  )
}
