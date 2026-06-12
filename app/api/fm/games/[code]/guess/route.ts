import { createServerClient } from '@/lib/supabase-server'
import { calculateScore } from '@/lib/game-utils'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const { playerId, roundMixId, guessedPlayerIds } = await request.json()

    if (!playerId || !roundMixId || !Array.isArray(guessedPlayerIds)) {
      return Response.json(
        { error: 'playerId, roundMixId, and guessedPlayerIds required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Get the round mix
    const { data: roundMix } = await supabase
      .from('fm_round_mixes')
      .select('*')
      .eq('id', roundMixId)
      .maybeSingle()

    if (!roundMix) {
      return Response.json({ error: 'Round mix not found' }, { status: 404 })
    }

    // Check if player already guessed
    const { data: existing } = await supabase
      .from('fm_guesses')
      .select('id')
      .eq('round_mix_id', roundMixId)
      .eq('player_id', playerId)
      .maybeSingle()

    if (existing) {
      return Response.json({ error: 'Already guessed for this photo' }, { status: 400 })
    }

    const score = calculateScore(roundMix.player_ids, guessedPlayerIds)

    const { error: guessError } = await supabase.from('fm_guesses').insert({
      round_mix_id: roundMixId,
      player_id: playerId,
      guessed_player_ids: guessedPlayerIds,
      score,
    })

    if (guessError) {
      console.error('Guess insert error:', guessError)
      return Response.json({ error: 'Failed to save guess' }, { status: 500 })
    }

    // Check if all players have guessed
    const { data: game } = await supabase
      .from('fm_games')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle()

    if (game) {
      const { data: allPlayers } = await supabase
        .from('fm_players')
        .select('id')
        .eq('game_id', game.id)

      const { data: allGuesses } = await supabase
        .from('fm_guesses')
        .select('player_id')
        .eq('round_mix_id', roundMixId)

      const totalPlayers = allPlayers?.length || 0
      const totalGuesses = allGuesses?.length || 0

      if (totalGuesses >= totalPlayers) {
        // All players guessed — touch the mix to trigger realtime
        await supabase
          .from('fm_round_mixes')
          .update({ status: 'ready' })
          .eq('id', roundMixId)
      }
    }

    return Response.json({ score })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/guess error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
