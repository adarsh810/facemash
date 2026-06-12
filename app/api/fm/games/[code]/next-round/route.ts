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

    const { data: game } = await supabase
      .from('fm_games')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle()

    if (!game) {
      return Response.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.host_session_id !== sessionId) {
      return Response.json({ error: 'Only the host can advance rounds' }, { status: 403 })
    }

    const nextRound = game.current_round + 1

    if (nextRound > game.rounds) {
      return Response.json({ error: 'No more rounds' }, { status: 400 })
    }

    await supabase
      .from('fm_games')
      .update({ current_round: nextRound, current_pic_index: 0, status: 'playing' })
      .eq('id', game.id)

    // Generation triggered client-side by play page
    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/next-round error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
