import { createServerClient } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const { playerId } = await request.json()

    if (!playerId) {
      return Response.json({ error: 'playerId required' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { error } = await supabase
      .from('fm_players')
      .update({ upload_done: true })
      .eq('id', playerId)

    if (error) {
      console.error('Update error:', error)
      return Response.json({ error: 'Failed to mark as ready' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/ready error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
