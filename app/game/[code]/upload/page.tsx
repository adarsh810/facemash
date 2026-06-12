'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Player } from '@/lib/types'

const PROMPTS = [
  { emoji: '🤪', text: 'Your silliest selfie' },
  { emoji: '💅', text: 'Confidence only — strike a pose' },
  { emoji: '😤', text: 'Most serious/professional face' },
  { emoji: '💪', text: 'Gym/flex/fitness era' },
  { emoji: '🌙', text: 'The face you make at 3am' },
]

export default function UploadPage() {
  const router = useRouter()
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [photos, setPhotos] = useState<(File | null)[]>([null, null, null, null, null])
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null, null, null])
  const [uploading, setUploading] = useState<boolean[]>([false, false, false, false, false])
  const [uploaded, setUploaded] = useState<boolean[]>([false, false, false, false, false])
  const [players, setPlayers] = useState<Player[]>([])
  const [isHost, setIsHost] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [markedReady, setMarkedReady] = useState(false)
  const [startingRounds, setStartingRounds] = useState(false)
  const [currentPrompt, setCurrentPrompt] = useState(0)
  const [sessionId, setSessionId] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [gameId, setGameId] = useState('')
  const galleryInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null, null])
  const cameraInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null, null])

  const loadPlayers = useCallback(async () => {
    const { data: gameRaw } = await supabase
      .from('fm_games')
      .select('id, host_session_id, status')
      .eq('code', code)
      .maybeSingle()

    const game = gameRaw as { id: string; host_session_id: string; status: string } | null
    if (!game) return

    if (game.status === 'playing') {
      router.push(`/game/${code}/play`)
      return
    }

    setGameId(game.id)
    const sid = localStorage.getItem('fm_session_id') || ''
    setIsHost(game.host_session_id === sid)

    const { data: playerRaw } = await supabase
      .from('fm_players')
      .select('*')
      .eq('game_id', game.id)
      .order('created_at', { ascending: true })

    const playerData = (playerRaw || []) as Player[]
    setPlayers(playerData)
    const allFinished = playerData.every((p) => p.upload_done)
    setAllDone(allFinished)
  }, [code, router])

  useEffect(() => {
    const sid = localStorage.getItem('fm_session_id') || ''
    const pid = localStorage.getItem(`fm_player_id_${code}`) || ''
    setSessionId(sid)
    setPlayerId(pid)

    loadPlayers()

    const channel = supabase
      .channel(`upload-${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fm_players' },
        () => { loadPlayers() }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fm_games', filter: `code=eq.${code}` },
        (payload) => {
          const g = payload.new as { status: string }
          if (g.status === 'playing') {
            router.push(`/game/${code}/play`)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [code, router, loadPlayers])

  function handleFileSelect(index: number, file: File) {
    const newPhotos = [...photos]
    newPhotos[index] = file
    setPhotos(newPhotos)

    const reader = new FileReader()
    reader.onload = (e) => {
      const newPreviews = [...previews]
      newPreviews[index] = e.target?.result as string
      setPreviews(newPreviews)
    }
    reader.readAsDataURL(file)
  }

  async function uploadPhoto(index: number) {
    const file = photos[index]
    if (!file || !playerId) return

    const newUploading = [...uploading]
    newUploading[index] = true
    setUploading(newUploading)

    try {
      const formData = new FormData()
      formData.append('photo', file)
      formData.append('photoIndex', String(index))
      formData.append('prompt', PROMPTS[index].text)
      formData.append('playerId', playerId)

      const res = await fetch(`/api/fm/games/${code}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const newUploaded = [...uploaded]
        newUploaded[index] = true
        setUploaded(newUploaded)

        // Auto-advance to next prompt
        if (index < 4) {
          setCurrentPrompt(index + 1)
        }
      } else {
        const d = await res.json()
        alert(d.error || 'Upload failed')
      }
    } finally {
      const newUploading = [...uploading]
      newUploading[index] = false
      setUploading(newUploading)
    }
  }

  async function handleDoneUploading() {
    if (!playerId) return

    const res = await fetch(`/api/fm/games/${code}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    })

    if (res.ok) {
      setMarkedReady(true)
    }
  }

  async function handleStartRounds() {
    setStartingRounds(true)
    try {
      const res = await fetch(`/api/fm/games/${code}/start-rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || 'Failed to start rounds')
      }
    } finally {
      setStartingRounds(false)
    }
  }

  const uploadedCount = uploaded.filter(Boolean).length
  const minUploaded = uploadedCount >= 2
  const canMarkReady = minUploaded && !markedReady

  return (
    <main className="min-h-screen flex flex-col items-center p-4 pt-8 pb-24">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(255,45,107,0.06) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-5">
        {/* Header */}
        <div className="text-center">
          <div className="text-3xl mb-1">📸</div>
          <h1 className="text-2xl font-black">Upload Your Photos</h1>
          <p style={{ color: '#A0A0A0' }} className="text-sm mt-1">
            These will be blended with others to create mystery faces!
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {PROMPTS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPrompt(i)}
              className="w-8 h-8 rounded-full text-sm font-bold transition-all flex items-center justify-center"
              style={{
                background: uploaded[i]
                  ? '#22c55e'
                  : i === currentPrompt
                  ? '#FF2D6B'
                  : '#1E1E1E',
                border: `2px solid ${
                  uploaded[i] ? '#22c55e' : i === currentPrompt ? '#FF2D6B' : '#2A2A2A'
                }`,
              }}
            >
              {uploaded[i] ? '✓' : i + 1}
            </button>
          ))}
        </div>

        {/* Current photo prompt */}
        <div
          className="rounded-2xl p-5"
          style={{ background: '#141414', border: '1px solid #2A2A2A' }}
        >
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">{PROMPTS[currentPrompt].emoji}</div>
            <h2 className="text-xl font-bold">{PROMPTS[currentPrompt].text}</h2>
            {currentPrompt >= 2 && (
              <p style={{ color: '#A0A0A0' }} className="text-xs mt-1">Optional</p>
            )}
          </div>

          {previews[currentPrompt] ? (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: '1' }}>
                <img
                  src={previews[currentPrompt]!}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                {uploaded[currentPrompt] && (
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.4)' }}>
                    <div className="text-4xl">✅</div>
                  </div>
                )}
              </div>
              {!uploaded[currentPrompt] && (
                <button
                  onClick={() => uploadPhoto(currentPrompt)}
                  disabled={uploading[currentPrompt]}
                  className="w-full py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: '#FF2D6B' }}
                >
                  {uploading[currentPrompt] ? '⏳ Uploading...' : '⬆️ Upload This Photo'}
                </button>
              )}
              {!uploaded[currentPrompt] && (
                <button
                  onClick={() => {
                    const newPhotos = [...photos]
                    newPhotos[currentPrompt] = null
                    setPhotos(newPhotos)
                    const newPreviews = [...previews]
                    newPreviews[currentPrompt] = null
                    setPreviews(newPreviews)
                  }}
                  className="w-full py-2 rounded-xl text-sm transition-all"
                  style={{ color: '#A0A0A0' }}
                >
                  ✕ Remove & retake
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Camera input */}
              <input
                ref={(el) => { cameraInputRefs.current[currentPrompt] = el }}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileSelect(currentPrompt, f)
                }}
              />
              <button
                onClick={() => cameraInputRefs.current[currentPrompt]?.click()}
                className="w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #FF2D6B, #FF6B35)',
                  boxShadow: '0 0 20px rgba(255,45,107,0.2)',
                }}
              >
                📷 Take Selfie
              </button>

              {/* Gallery input */}
              <input
                ref={(el) => { galleryInputRefs.current[currentPrompt] = el }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileSelect(currentPrompt, f)
                }}
              />
              <button
                onClick={() => galleryInputRefs.current[currentPrompt]?.click()}
                className="w-full py-3 rounded-xl font-semibold transition-all active:scale-95"
                style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
              >
                🖼️ Choose from Gallery
              </button>
            </div>
          )}
        </div>

        {/* Navigation between prompts */}
        <div className="flex gap-3">
          {currentPrompt > 0 && (
            <button
              onClick={() => setCurrentPrompt(currentPrompt - 1)}
              className="flex-1 py-3 rounded-xl font-semibold"
              style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
            >
              ← Prev
            </button>
          )}
          {currentPrompt < 4 && (
            <button
              onClick={() => setCurrentPrompt(currentPrompt + 1)}
              className="flex-1 py-3 rounded-xl font-semibold"
              style={{ background: '#1E1E1E', border: '1px solid #2A2A2A' }}
            >
              Next →
            </button>
          )}
        </div>

        {/* Done uploading button */}
        {canMarkReady && (
          <button
            onClick={handleDoneUploading}
            className="w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #7B2FFF, #4F1FCC)',
              boxShadow: '0 0 20px rgba(123,47,255,0.3)',
            }}
          >
            ✅ Done Uploading ({uploadedCount}/5 photos)
          </button>
        )}

        {markedReady && (
          <div
            className="p-4 rounded-2xl text-center"
            style={{
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
            }}
          >
            <p className="font-semibold" style={{ color: '#22c55e' }}>
              ✅ You&apos;re ready! Waiting for others...
            </p>
          </div>
        )}

        {/* Players progress */}
        <div
          className="rounded-2xl p-4"
          style={{ background: '#141414', border: '1px solid #2A2A2A' }}
        >
          <h3 className="font-bold mb-3">Upload Progress</h3>
          <div className="space-y-2">
            {players.map((player) => (
              <div key={player.id} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: player.upload_done ? '#22c55e' : '#2A2A2A' }}
                >
                  {player.upload_done ? '✓' : player.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm flex-1">{player.name}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: player.upload_done
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(160,160,160,0.1)',
                    color: player.upload_done ? '#22c55e' : '#A0A0A0',
                  }}
                >
                  {player.upload_done ? 'Ready ✓' : 'Uploading...'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Host start rounds button */}
        {isHost && allDone && (
          <button
            onClick={handleStartRounds}
            disabled={startingRounds}
            className="w-full py-5 rounded-2xl text-xl font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #FF2D6B, #FF6B35)',
              boxShadow: '0 0 30px rgba(255,45,107,0.3)',
            }}
          >
            {startingRounds ? '⏳ Generating mixes...' : '🚀 Start Rounds →'}
          </button>
        )}

        {isHost && !allDone && players.length > 0 && (
          <div
            className="p-3 rounded-xl text-center text-sm"
            style={{ background: '#141414', border: '1px solid #2A2A2A', color: '#A0A0A0' }}
          >
            Waiting for all players to finish uploading...
          </div>
        )}
      </div>
    </main>
  )
}
