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
      return Response.json({ error: 'Only the host can advance' }, { status: 403 })
    }

    const nextPicIndex = game.current_pic_index + 1

    if (nextPicIndex < 5) {
      // More pics in this round
      await supabase
        .from('fm_games')
        .update({ current_pic_index: nextPicIndex })
        .eq('id', game.id)

      // Trigger generation of next mix
      const { data: nextMix } = await supabase
        .from('fm_round_mixes')
        .select('*')
        .eq('game_id', game.id)
        .eq('round_number', game.current_round)
        .eq('pic_index', nextPicIndex)
        .maybeSingle()

      // Generation is triggered client-side by the play page
    } else {
      // Round done
      if (game.current_round < game.rounds) {
        await supabase
          .from('fm_games')
          .update({ status: 'round_results' })
          .eq('id', game.id)
      } else {
        await supabase
          .from('fm_games')
          .update({ status: 'finished' })
          .eq('id', game.id)
      }
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/next-pic error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
