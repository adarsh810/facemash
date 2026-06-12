import { createServerClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const codes = (searchParams.get('codes') || '').split(',').filter(Boolean).map((c) => c.toUpperCase())
  const before = searchParams.get('before')
  const limit = Math.min(parseInt(searchParams.get('limit') || '12'), 50)
  const sessionId = searchParams.get('sessionId') || ''

  if (codes.length === 0) return Response.json({ blends: [], hasMore: false, nextCursor: null })

  const supabase = createServerClient()

  const { data: games } = await supabase
    .from('fm_games')
    .select('id, code')
    .in('code', codes)

  if (!games || games.length === 0) return Response.json({ blends: [], hasMore: false, nextCursor: null })

  const gameIdToCode = Object.fromEntries(games.map((g) => [g.id, g.code]))
  const gameIds = Object.keys(gameIdToCode)

  let query = supabase
    .from('fm_round_mixes')
    .select('*')
    .in('game_id', gameIds)
    .eq('status', 'ready')
    .not('mixed_photo_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (before) query = query.lt('created_at', before)

  const { data: mixes } = await query
  const items = (mixes || []).slice(0, limit)
  const hasMore = (mixes || []).length > limit

  const allPlayerIds = [...new Set(items.flatMap((m) => m.player_ids as string[]))]
  const { data: playersRaw } = await supabase
    .from('fm_players')
    .select('id, name')
    .in('id', allPlayerIds)

  const playerMap = Object.fromEntries((playersRaw || []).map((p) => [p.id, p.name]))

  const mixIds = items.map((m) => m.id)
  const { data: myLikes } = sessionId
    ? await supabase.from('fm_blend_likes').select('mix_id').eq('session_id', sessionId).in('mix_id', mixIds)
    : { data: [] }

  const likedSet = new Set((myLikes || []).map((l) => l.mix_id))

  const blends = items.map((m) => ({
    id: m.id,
    mixed_photo_url: m.mixed_photo_url,
    round_number: m.round_number,
    game_code: gameIdToCode[m.game_id],
    player_names: (m.player_ids as string[]).map((pid) => playerMap[pid] || 'Unknown'),
    likes_count: m.likes_count || 0,
    user_liked: likedSet.has(m.id),
    created_at: m.created_at,
  }))

  return Response.json({
    blends,
    hasMore,
    nextCursor: hasMore ? items[items.length - 1].created_at : null,
  })
}
