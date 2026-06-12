import { createServerClient } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const { name, sessionId } = await request.json()

    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!sessionId) {
      return Response.json({ error: 'sessionId required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Find game
    const { data: game, error: gameError } = await supabase
      .from('fm_games')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle()

    if (gameError || !game) {
      return Response.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'lobby') {
      return Response.json({ error: 'Game has already started' }, { status: 400 })
    }

    // Check player count
    const { data: existingPlayers } = await supabase
      .from('fm_players')
      .select('id, name, session_id')
      .eq('game_id', game.id)

    if (existingPlayers && existingPlayers.length >= 15) {
      return Response.json({ error: 'Game is full (max 15 players)' }, { status: 400 })
    }

    // Check if same session already joined
    const existingSession = existingPlayers?.find((p) => p.session_id === sessionId)
    if (existingSession) {
      return Response.json({ playerId: existingSession.id, gameId: game.id })
    }

    // Check name not taken
    const nameTaken = existingPlayers?.some(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase()
    )
    if (nameTaken) {
      return Response.json({ error: 'Name already taken in this game' }, { status: 400 })
    }

    // Insert player
    const { data: player, error: playerError } = await supabase
      .from('fm_players')
      .insert({
        game_id: game.id,
        name: name.trim(),
        session_id: sessionId,
        is_host: false,
        upload_done: false,
      })
      .select()
      .single()

    if (playerError || !player) {
      console.error('Player insert error:', playerError)
      return Response.json({ error: 'Failed to join game' }, { status: 500 })
    }

    return Response.json({ playerId: player.id, gameId: game.id })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/join error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
