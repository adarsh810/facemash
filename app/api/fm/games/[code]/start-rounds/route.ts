import { createServerClient } from '@/lib/supabase-server'
import { generateRoundMixes, picsPerRound } from '@/lib/game-utils'
import { Photo, Player } from '@/lib/types'

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
      return Response.json({ error: 'Only the host can start rounds' }, { status: 403 })
    }

    // Fetch all players and photos
    const { data: players } = await supabase
      .from('fm_players')
      .select('*')
      .eq('game_id', game.id)

    const { data: photos } = await supabase
      .from('fm_photos')
      .select('*')
      .eq('game_id', game.id)

    if (!players || players.length < 2) {
      return Response.json({ error: 'Need at least 2 players' }, { status: 400 })
    }

    if (!photos || photos.length === 0) {
      return Response.json({ error: 'No photos uploaded' }, { status: 400 })
    }

    // Generate round mix plans
    const pics = picsPerRound(players.length)
    const mixPlans = generateRoundMixes(players as Player[], photos as Photo[], game.rounds, pics)

    if (mixPlans.length === 0) {
      return Response.json({ error: 'Could not generate round mixes' }, { status: 400 })
    }

    // Insert all round mix records
    const { data: insertedMixes, error: insertError } = await supabase
      .from('fm_round_mixes')
      .insert(
        mixPlans.map((plan) => ({
          game_id: game.id,
          round_number: plan.round_number,
          pic_index: plan.pic_index,
          player_ids: plan.player_ids,
          photo_ids: plan.photo_ids,
          mixed_photo_url: null,
          status: 'pending',
        }))
      )
      .select()

    if (insertError || !insertedMixes) {
      console.error('Insert mixes error:', insertError)
      return Response.json({ error: 'Failed to create round mixes' }, { status: 500 })
    }

    // Update game status
    await supabase
      .from('fm_games')
      .update({ status: 'playing', current_round: 1, current_pic_index: 0 })
      .eq('id', game.id)

    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/start-rounds error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
