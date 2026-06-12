import { createServerClient } from '@/lib/supabase-server'
import { blendFaces } from '@/lib/fal'
import { Photo } from '@/lib/types'

async function generateMixInBackground(
  mixId: string,
  photoIds: string[],
  allPhotos: Photo[]
) {
  const supabase = createServerClient()
  try {
    await supabase
      .from('fm_round_mixes')
      .update({ status: 'generating' })
      .eq('id', mixId)

    const photoUrls = photoIds
      .map((pid) => allPhotos.find((p) => p.id === pid)?.photo_url)
      .filter(Boolean) as string[]

    const mixedUrl = await blendFaces(photoUrls)

    await supabase
      .from('fm_round_mixes')
      .update({ mixed_photo_url: mixedUrl, status: 'ready' })
      .eq('id', mixId)
  } catch (err) {
    console.error('Background mix generation error:', err)
    await supabase
      .from('fm_round_mixes')
      .update({ status: 'failed' })
      .eq('id', mixId)
  }
}

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

    // Trigger generation of first pic of new round
    const { data: firstMix } = await supabase
      .from('fm_round_mixes')
      .select('*')
      .eq('game_id', game.id)
      .eq('round_number', nextRound)
      .eq('pic_index', 0)
      .maybeSingle()

    if (firstMix && firstMix.status === 'pending') {
      const { data: photos } = await supabase
        .from('fm_photos')
        .select('*')
        .eq('game_id', game.id)

      generateMixInBackground(firstMix.id, firstMix.photo_ids, (photos || []) as Photo[]).catch(
        console.error
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/next-round error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
