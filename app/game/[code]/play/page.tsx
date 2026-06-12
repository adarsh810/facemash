'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Game, Player, RoundMix, Guess } from '@/lib/types'

export default function PlayPage() {
  const router = useRouter()
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentMix, setCurrentMix] = useState<RoundMix | null>(null)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [myGuess, setMyGuess] = useState<Guess | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [showReveal, setShowReveal] = useState(false)
  const [roundScores, setRoundScores] = useState<Record<string, number>>({})
  const [advancingRound, setAdvancingRound] = useState(false)
  const [timer, setTimer] = useState(30)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [timerActive, setTimerActive] = useState(false)

  const generatingRef = useRef<string | null>(null)

  const triggerGeneration = useCallback(async (mixId: string) => {
    if (generatingRef.current === mixId) return
    generatingRef.current = mixId
    try {
      await fetch(`/api/fm/games/${code}/generate-mix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mixId }),
      })
    } catch (e) {
      console.error('generate-mix call failed', e)
    }
  }, [code])

  const loadGame = useCallback(async () => {
    const { data: gameRaw } = await supabase
      .from('fm_games')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    const gameData = gameRaw as Game | null
    if (!gameData) return

    if (gameData.status === 'finished') {
      router.push(`/game/${code}/results`)
      return
    }

    setGame(gameData)

    const sid = localStorage.getItem('fm_session_id') || ''
    setIsHost(gameData.host_session_id === sid)

    const { data: playerRaw } = await supabase
      .from('fm_players')
      .select('*')
      .eq('game_id', gameData.id)
      .order('created_at', { ascending: true })

    const playerData = (playerRaw || []) as Player[]
    setPlayers(playerData)

    // Load current mix
    const { data: mixRaw } = await supabase
      .from('fm_round_mixes')
      .select('*')
      .eq('game_id', gameData.id)
      .eq('round_number', gameData.current_round)
      .eq('pic_index', gameData.current_pic_index)
      .maybeSingle()

    const mixData = mixRaw as RoundMix | null
    if (mixData) {
      setCurrentMix(mixData)

      // Load guesses for this mix
      const { data: guessRaw } = await supabase
        .from('fm_guesses')
        .select('*')
        .eq('round_mix_id', mixData.id)

      const guessData = (guessRaw || []) as Guess[]
      setGuesses(guessData)
      const pid = localStorage.getItem(`fm_player_id_${code}`) || ''
      const myG = guessData.find((g) => g.player_id === pid)
      if (myG) setMyGuess(myG)

      // Check if all players guessed
      if (playerData && guessData.length >= playerData.length) {
        setShowReveal(true)
        setTimerActive(false)
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [code, router])

  useEffect(() => {
    const sid = localStorage.getItem('fm_session_id') || ''
    const pid = localStorage.getItem(`fm_player_id_${code}`) || ''
    setSessionId(sid)
    setPlayerId(pid)

    loadGame()

    const channel = supabase
      .channel(`play-${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fm_games', filter: `code=eq.${code}` },
        (payload) => {
          const g = payload.new as Game
          if (g.status === 'finished') {
            router.push(`/game/${code}/results`)
            return
          }
          setGame(g)
          if (g.status === 'playing') {
            setShowReveal(false)
            setMyGuess(null)
            setSelectedIds([])
            setGuesses([])
            setTimer(30)
            setTimerActive(false)
          }
          loadGame()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fm_round_mixes' },
        (payload) => {
          const mix = payload.new as RoundMix
          if (game && mix.game_id === game.id) {
            if (
              mix.round_number === game.current_round &&
              mix.pic_index === game.current_pic_index
            ) {
              setCurrentMix(mix)
              if (mix.status === 'ready' && mix.mixed_photo_url) {
                setTimerActive(true)
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fm_guesses' },
        () => { loadGame() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [code, router, loadGame, game])

  // Trigger generation when mix is pending
  useEffect(() => {
    if (currentMix && (currentMix.status === 'pending' || currentMix.status === 'failed')) {
      triggerGeneration(currentMix.id)
    }
  }, [currentMix?.id, currentMix?.status, triggerGeneration])

  // Timer effect
  useEffect(() => {
    if (timerActive && !myGuess) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            setShowReveal(true)
            setTimerActive(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timerActive, myGuess])

  // Start timer when mix becomes ready
  useEffect(() => {
    if (currentMix?.status === 'ready' && currentMix.mixed_photo_url && !myGuess) {
      setTimerActive(true)
      setTimer(30)
    }
  }, [currentMix?.status, currentMix?.mixed_photo_url, myGuess])

  // Load round scores
  useEffect(() => {
    if (game?.status === 'round_results' && players.length > 0) {
      loadRoundScores()
    }
  }, [game?.status])

  async function loadRoundScores() {
    if (!game) return
    const { data: mixesRaw } = await supabase
      .from('fm_round_mixes')
      .select('id')
      .eq('game_id', game.id)

    const mixes = (mixesRaw || []) as { id: string }[]
    const mixIds = mixes.map((m) => m.id)

    const { data: allGuessesRaw } = await supabase
      .from('fm_guesses')
      .select('player_id, score')
      .in('round_mix_id', mixIds)

    const allGuesses = (allGuessesRaw || []) as { player_id: string; score: number }[]

    const scores: Record<string, number> = {}
    for (const g of allGuesses) {
      scores[g.player_id] = (scores[g.player_id] || 0) + g.score
    }
    setRoundScores(scores)
  }

  function togglePlayer(pid: string) {
    setSelectedIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    )
  }

  async function submitGuess() {
    if (!currentMix || !playerId || selectedIds.length === 0) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/fm/games/${code}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          roundMixId: currentMix.id,
          guessedPlayerIds: selectedIds,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMyGuess({
          id: 'local',
          round_mix_id: currentMix.id,
          player_id: playerId,
          guessed_player_ids: selectedIds,
          score: data.score,
          created_at: new Date().toISOString(),
        })
        setTimerActive(false)
        if (timerRef.current) clearInterval(timerRef.current)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleNextPic() {
    setAdvancingRound(true)
    try {
      await fetch(`/api/fm/games/${code}/next-pic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } finally {
      setAdvancingRound(false)
    }
  }

  async function handleNextRound() {
    setAdvancingRound(true)
    try {
      await fetch(`/api/fm/games/${code}/next-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } finally {
      setAdvancingRound(false)
    }
  }

  function getPlayerName(pid: string) {
    return players.find((p) => p.id === pid)?.name || 'Unknown'
  }

  // Round results screen
  if (game?.status === 'round_results') {
    const sorted = [...players].sort(
      (a, b) => (roundScores[b.id] || 0) - (roundScores[a.id] || 0)
    )

    return (
      <main className="min-h-screen flex flex-col items-center p-4 pt-8">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h1 className="text-2xl font-black">Round {game.current_round} Results</h1>
            <p style={{ color: '#A0A0A0' }} className="text-sm mt-1">
              Scores after {game.current_round} round{game.current_round > 1 ? 's' : ''}
            </p>
          </div>

          <div
            className="rounded-2xl p-4 space-y-2"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            {sorted.map((player, i) => (
              <div
                key={player.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                style={{
                  background: player.id === playerId ? 'rgba(255,45,107,0.1)' : '#1E1E1E',
                  border: `1px solid ${player.id === playerId ? '#FF2D6B' : '#2A2A2A'}`,
                }}
              >
                <span className="text-lg font-bold w-8 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </span>
                <span className="flex-1 font-medium">{player.name}</span>
                <span className="font-bold" style={{ color: '#FF2D6B' }}>
                  {roundScores[player.id] || 0} pts
                </span>
              </div>
            ))}
          </div>

          {isHost && (
            <button
              onClick={handleNextRound}
              disabled={advancingRound}
              className="w-full py-5 rounded-2xl text-xl font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #FF2D6B, #FF6B35)',
                boxShadow: '0 0 30px rgba(255,45,107,0.3)',
              }}
            >
              {advancingRound ? '⏳ Loading...' : `Start Round ${game.current_round + 1} →`}
            </button>
          )}

          {!isHost && (
            <div
              className="p-4 rounded-2xl text-center"
              style={{ background: '#141414', border: '1px solid #2A2A2A' }}
            >
              <p style={{ color: '#A0A0A0' }}>Waiting for host to start next round...</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  if (!game || !currentMix) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-[#FF2D6B] border-t-transparent animate-spin mx-auto" />
          <p style={{ color: '#A0A0A0' }}>Loading game...</p>
        </div>
      </main>
    )
  }

  const allPlayersGuessed = players.length > 0 && guesses.length >= players.length
  const shouldReveal = showReveal || allPlayersGuessed

  return (
    <main className="min-h-screen flex flex-col items-center p-4 pt-6 pb-24">
      <div className="w-full max-w-md space-y-4">
        {/* Round/pic indicator */}
        <div className="flex items-center justify-between">
          <div
            className="px-3 py-1.5 rounded-full text-sm font-bold"
            style={{ background: 'rgba(255,45,107,0.15)', color: '#FF2D6B' }}
          >
            Round {game.current_round} / {game.rounds}
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background:
                    i < game.current_pic_index
                      ? '#22c55e'
                      : i === game.current_pic_index
                      ? '#FF2D6B'
                      : '#1E1E1E',
                  border: `1px solid ${
                    i < game.current_pic_index
                      ? '#22c55e'
                      : i === game.current_pic_index
                      ? '#FF2D6B'
                      : '#2A2A2A'
                  }`,
                }}
              >
                {i < game.current_pic_index ? '✓' : i + 1}
              </div>
            ))}
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-sm font-bold"
            style={{ background: '#1E1E1E', color: '#A0A0A0' }}
          >
            Photo {game.current_pic_index + 1}/5
          </div>
        </div>

        {/* Mixed photo */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#141414',
            border: '1px solid #2A2A2A',
            aspectRatio: '1',
          }}
        >
          {currentMix.status === 'ready' && currentMix.mixed_photo_url ? (
            <img
              src={currentMix.mixed_photo_url}
              alt="Mystery face"
              className="w-full h-full object-cover"
            />
          ) : currentMix.status === 'failed' ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6">
              <div className="text-4xl">😵</div>
              <p style={{ color: '#A0A0A0' }} className="text-sm text-center">
                AI blending failed — showing original
              </p>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full border-4 border-[#FF2D6B] border-t-transparent animate-spin" />
              <p style={{ color: '#A0A0A0' }} className="text-sm">
                🤖 AI is blending faces...
              </p>
              <p style={{ color: '#555' }} className="text-xs">
                This takes about 20-30 seconds
              </p>
            </div>
          )}
        </div>

        {/* Timer bar */}
        {timerActive && !myGuess && currentMix.status === 'ready' && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs" style={{ color: '#A0A0A0' }}>
              <span>⏱ Time to guess</span>
              <span
                style={{ color: timer <= 10 ? '#FF2D6B' : '#A0A0A0' }}
                className={timer <= 10 ? 'font-bold' : ''}
              >
                {timer}s
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: '#2A2A2A' }}
            >
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${(timer / 30) * 100}%`,
                  background: timer <= 10 ? '#FF2D6B' : '#7B2FFF',
                }}
              />
            </div>
          </div>
        )}

        {/* Guess panel */}
        {!shouldReveal && currentMix.status === 'ready' && !myGuess && (
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <p className="font-bold text-center">🤔 Who&apos;s in this photo?</p>
            <p style={{ color: '#A0A0A0' }} className="text-sm text-center">
              Select {currentMix.player_ids.length} people
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {players.map((player) => {
                const sel = selectedIds.includes(player.id)
                return (
                  <button
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className="px-4 py-2 rounded-full font-semibold text-sm transition-all active:scale-95"
                    style={{
                      background: sel ? '#FF2D6B' : '#1E1E1E',
                      border: `2px solid ${sel ? '#FF2D6B' : '#2A2A2A'}`,
                      boxShadow: sel ? '0 0 12px rgba(255,45,107,0.3)' : 'none',
                    }}
                  >
                    {player.name}
                  </button>
                )
              })}
            </div>
            <button
              onClick={submitGuess}
              disabled={submitting || selectedIds.length === 0}
              className="w-full py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-40"
              style={{
                background:
                  selectedIds.length > 0
                    ? 'linear-gradient(135deg, #FF2D6B, #FF6B35)'
                    : '#1E1E1E',
              }}
            >
              {submitting
                ? '⏳ Submitting...'
                : selectedIds.length === 0
                ? 'Select players first'
                : `Submit Guess (${selectedIds.length} selected)`}
            </button>
          </div>
        )}

        {/* Waiting after guessing */}
        {myGuess && !shouldReveal && (
          <div
            className="rounded-2xl p-4 text-center space-y-2"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <p className="font-bold">
              ✅ Guess submitted! +{myGuess.score} pts
            </p>
            <p style={{ color: '#A0A0A0' }} className="text-sm">
              Your guess: {myGuess.guessed_player_ids.map(getPlayerName).join(', ')}
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <div className="w-2 h-2 rounded-full bg-[#7B2FFF] animate-pulse" />
              <p style={{ color: '#A0A0A0' }} className="text-sm">
                Waiting for others... ({guesses.length}/{players.length})
              </p>
            </div>
          </div>
        )}

        {/* Reveal panel */}
        {shouldReveal && currentMix && (
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: '#141414', border: '1px solid #2A2A2A' }}
          >
            <p className="font-bold text-center text-lg">🎭 Reveal!</p>

            <div className="space-y-1">
              <p style={{ color: '#A0A0A0' }} className="text-xs">Actually in this photo:</p>
              <div className="flex flex-wrap gap-2">
                {currentMix.player_ids.map((pid) => (
                  <span
                    key={pid}
                    className="px-3 py-1 rounded-full text-sm font-bold"
                    style={{ background: 'rgba(255,45,107,0.2)', color: '#FF2D6B' }}
                  >
                    {getPlayerName(pid)}
                  </span>
                ))}
              </div>
            </div>

            {/* Per-player scores */}
            <div className="space-y-1.5">
              <p style={{ color: '#A0A0A0' }} className="text-xs">Scores this photo:</p>
              {players.map((player) => {
                const g = guesses.find((gx) => gx.player_id === player.id)
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: player.id === playerId ? 'rgba(255,45,107,0.1)' : '#1E1E1E',
                    }}
                  >
                    <span className="flex-1 text-sm">{player.name}</span>
                    {g ? (
                      <>
                        <span style={{ color: '#A0A0A0' }} className="text-xs">
                          guessed: {g.guessed_player_ids.map(getPlayerName).join(', ')}
                        </span>
                        <span
                          className="font-bold text-sm ml-2"
                          style={{ color: g.score > 0 ? '#22c55e' : '#A0A0A0' }}
                        >
                          +{g.score}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: '#555' }} className="text-xs">No guess</span>
                    )}
                  </div>
                )
              })}
            </div>

            {isHost && (
              <button
                onClick={handleNextPic}
                disabled={advancingRound}
                className="w-full py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 mt-2"
                style={{ background: 'linear-gradient(135deg, #FF2D6B, #FF6B35)' }}
              >
                {advancingRound
                  ? '⏳ Loading...'
                  : game.current_pic_index < 4
                  ? 'Next Photo →'
                  : game.current_round < game.rounds
                  ? 'Round Results →'
                  : 'See Final Results →'}
              </button>
            )}

            {!isHost && (
              <p style={{ color: '#A0A0A0' }} className="text-sm text-center pt-2">
                Waiting for host to advance...
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
