import { createServerClient } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const { sessionId } = await request.json()

    if (!sessionId) {
      return Response.json({ error: 'sessionId required' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: game, error: gameError } = await supabase
      .from('fm_games')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle()

    if (gameError || !game) {
      return Response.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.host_session_id !== sessionId) {
      return Response.json({ error: 'Only the host can start the game' }, { status: 403 })
    }

    if (game.status !== 'lobby') {
      return Response.json({ error: 'Game is not in lobby state' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('fm_games')
      .update({ status: 'uploading' })
      .eq('id', game.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return Response.json({ error: 'Failed to start game' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/start error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
