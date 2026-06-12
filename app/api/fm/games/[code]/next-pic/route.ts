import { createServerClient } from '@/lib/supabase-server'
import { picsPerRound } from '@/lib/game-utils'

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

    const { data: players } = await supabase
      .from('fm_players')
      .select('id')
      .eq('game_id', game.id)

    const pics = picsPerRound((players || []).length)
    const nextPicIndex = game.current_pic_index + 1

    if (nextPicIndex < pics) {
      await supabase
        .from('fm_games')
        .update({ current_pic_index: nextPicIndex })
        .eq('id', game.id)
      // Generation triggered client-side by play page
    } else {
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
