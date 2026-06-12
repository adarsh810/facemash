import { createServerClient } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    await params // consume params
    const { playerId, name } = await request.json()

    if (!playerId || !name) {
      return Response.json({ error: 'playerId and name required' }, { status: 400 })
    }

    const supabase = createServerClient()

    await supabase
      .from('fm_players')
      .update({ name: name.trim() })
      .eq('id', playerId)

    return Response.json({ success: true })
  } catch (error) {
    console.error('update-name error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
