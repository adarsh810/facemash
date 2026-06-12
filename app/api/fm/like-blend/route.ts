import { createServerClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const { mixId, sessionId } = await request.json()
  if (!mixId || !sessionId) {
    return Response.json({ error: 'mixId and sessionId required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('fm_blend_likes')
    .select('id')
    .eq('mix_id', mixId)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (existing) {
    await supabase.from('fm_blend_likes').delete().eq('id', existing.id)
    const { data: mix } = await supabase
      .from('fm_round_mixes')
      .select('likes_count')
      .eq('id', mixId)
      .single()
    await supabase
      .from('fm_round_mixes')
      .update({ likes_count: Math.max(0, (mix?.likes_count || 0) - 1) })
      .eq('id', mixId)
    return Response.json({ liked: false })
  } else {
    await supabase.from('fm_blend_likes').insert({ mix_id: mixId, session_id: sessionId })
    const { data: mix } = await supabase
      .from('fm_round_mixes')
      .select('likes_count')
      .eq('id', mixId)
      .single()
    await supabase
      .from('fm_round_mixes')
      .update({ likes_count: (mix?.likes_count || 0) + 1 })
      .eq('id', mixId)
    return Response.json({ liked: true })
  }
}
