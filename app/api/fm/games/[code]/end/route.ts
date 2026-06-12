import { createServerClient } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const { sessionId } = await request.json()

  if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })

  const supabase = createServerClient()

  const { data: game } = await supabase
    .from('fm_games')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!game) return Response.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_session_id !== sessionId) {
    return Response.json({ error: 'Only the host can end the game' }, { status: 403 })
  }

  await supabase.from('fm_games').update({ status: 'finished' }).eq('id', game.id)

  return Response.json({ success: true })
}
