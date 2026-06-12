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

  const { data: photos } = await supabase
    .from('fm_photos')
    .select('photo_url')
    .in('game_id', gameIds)

  // Extract storage paths — input photos are at {CODE}/{PLAYER_ID}/{INDEX}.ext
  // Blend photos are at blends/{CODE}/{MIX_ID}.jpg — skip those
  const storagePaths = (photos || [])
    .map((p) => {
      const match = p.photo_url.match(/\/facemash-photos\/(.+)$/)
      const path = match?.[1] ?? null
      if (!path || path.startsWith('blends/')) return null
      return path
    })
    .filter(Boolean) as string[]

  if (storagePaths.length > 0) {
    // Supabase storage.remove accepts max 1000 at a time
    for (let i = 0; i < storagePaths.length; i += 1000) {
      await supabase.storage.from('facemash-photos').remove(storagePaths.slice(i, i + 1000))
    }
  }

  await supabase.from('fm_photos').delete().in('game_id', gameIds)

  return Response.json({ deleted: storagePaths.length })
}
