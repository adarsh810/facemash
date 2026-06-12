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
      return Response.json({ error: 'Only the host can reset' }, { status: 403 })
    }

    // Delete old data
    const { data: roundMixes } = await supabase
      .from('fm_round_mixes')
      .select('id')
      .eq('game_id', game.id)

    if (roundMixes && roundMixes.length > 0) {
      const mixIds = roundMixes.map((m) => m.id)
      await supabase.from('fm_guesses').delete().in('round_mix_id', mixIds)
    }

    await supabase.from('fm_round_mixes').delete().eq('game_id', game.id)
    await supabase.from('fm_photos').delete().eq('game_id', game.id)
    await supabase
      .from('fm_players')
      .update({ upload_done: false })
      .eq('game_id', game.id)

    // Reset game
    await supabase
      .from('fm_games')
      .update({
        status: 'lobby',
        current_round: 0,
        current_pic_index: 0,
      })
      .eq('id', game.id)

    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/reset error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
