import { createServerClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const { gameCodes } = await request.json()
  if (!Array.isArray(gameCodes) || gameCodes.length === 0) {
    return Response.json({ error: 'gameCodes required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: games } = await supabase
    .from('fm_games')
    .select('id')
    .in('code', gameCodes.map((c: string) => c.toUpperCase()))

  const gameIds = (games || []).map((g) => g.id)
  if (gameIds.length === 0) return Response.json({ deleted: 0 })

  const { data: mixes } = await supabase
    .from('fm_round_mixes')
    .select('id, mixed_photo_url')
    .in('game_id', gameIds)
    .not('mixed_photo_url', 'is', null)

  const storagePaths = (mixes || [])
    .map((m) => {
      const match = m.mixed_photo_url?.match(/\/facemash-photos\/(.+)$/)
      const path = match?.[1] ?? null
      if (!path || !path.startsWith('blends/')) return null
      return path
    })
    .filter(Boolean) as string[]

  if (storagePaths.length > 0) {
    for (let i = 0; i < storagePaths.length; i += 1000) {
      await supabase.storage.from('facemash-photos').remove(storagePaths.slice(i, i + 1000))
    }
  }

  const mixIds = (mixes || [])
    .filter((m) => m.mixed_photo_url?.includes('/blends/'))
    .map((m) => m.id)

  if (mixIds.length > 0) {
    await supabase
      .from('fm_round_mixes')
      .update({ mixed_photo_url: null })
      .in('id', mixIds)
  }

  return Response.json({ deleted: storagePaths.length })
}
