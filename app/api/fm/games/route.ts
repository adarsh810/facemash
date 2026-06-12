import { createServerClient } from '@/lib/supabase-server'
import { generateGameCode } from '@/lib/game-utils'

export async function POST(request: Request) {
  try {
    const { rounds, sessionId } = await request.json()

    if (!rounds || ![3, 5].includes(rounds)) {
      return Response.json({ error: 'Invalid rounds. Must be 3 or 5.' }, { status: 400 })
    }
    if (!sessionId) {
      return Response.json({ error: 'sessionId required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Generate unique game code
    let code = ''
    let attempts = 0
    while (attempts < 10) {
      const candidate = generateGameCode()
      const { data: existing } = await supabase
        .from('fm_games')
        .select('id')
        .eq('code', candidate)
        .maybeSingle()
      if (!existing) {
        code = candidate
        break
      }
      attempts++
    }

    if (!code) {
      return Response.json({ error: 'Failed to generate unique code' }, { status: 500 })
    }

    // Insert game
    const { data: game, error: gameError } = await supabase
      .from('fm_games')
      .insert({
        code,
        host_session_id: sessionId,
        status: 'lobby',
        rounds,
        current_round: 0,
        current_pic_index: 0,
      })
      .select()
      .single()

    if (gameError || !game) {
      console.error('Game insert error:', gameError)
      return Response.json({ error: 'Failed to create game' }, { status: 500 })
    }

    // Insert host player
    const { data: player, error: playerError } = await supabase
      .from('fm_players')
      .insert({
        game_id: game.id,
        name: 'Host',
        session_id: sessionId,
        is_host: true,
        upload_done: false,
      })
      .select()
      .single()

    if (playerError || !player) {
      console.error('Player insert error:', playerError)
      return Response.json({ error: 'Failed to create host player' }, { status: 500 })
    }

    return Response.json({ gameCode: code, playerId: player.id })
  } catch (error) {
    console.error('POST /api/fm/games error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
