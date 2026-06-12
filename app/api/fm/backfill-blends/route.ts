import { createServerClient } from '@/lib/supabase-server'

export const maxDuration = 120

export async function POST(request: Request) {
  const { gameCodes } = await request.json()
  if (!Array.isArray(gameCodes) || gameCodes.length === 0) {
    return Response.json({ error: 'gameCodes required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: games } = await supabase
    .from('fm_games')
    .select('id, code')
    .in('code', gameCodes.map((c: string) => c.toUpperCase()))

  const gameIds = (games || []).map((g) => g.id)
  if (gameIds.length === 0) return Response.json({ migrated: 0 })

  const { data: mixes } = await supabase
    .from('fm_round_mixes')
    .select('id, mixed_photo_url, game_id')
    .in('game_id', gameIds)
    .eq('status', 'ready')
    .not('mixed_photo_url', 'is', null)

  const gameCodeMap = Object.fromEntries((games || []).map((g) => [g.id, g.code]))

  const external = (mixes || []).filter(
    (m) => m.mixed_photo_url && !m.mixed_photo_url.includes('.supabase.co/')
  )

  let migrated = 0
  for (const mix of external) {
    try {
      const resp = await fetch(mix.mixed_photo_url)
      if (!resp.ok) continue
      const buf = Buffer.from(await resp.arrayBuffer())
      const storagePath = `blends/${gameCodeMap[mix.game_id]}/${mix.id}.jpg`
      const { error: upErr } = await supabase.storage
        .from('facemash-photos')
        .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true })
      if (upErr) continue
      const { data: urlData } = supabase.storage
        .from('facemash-photos')
        .getPublicUrl(storagePath)
      await supabase
        .from('fm_round_mixes')
        .update({ mixed_photo_url: urlData.publicUrl })
        .eq('id', mix.id)
      migrated++
    } catch {
      // URL expired or network error — skip
    }
  }

  return Response.json({ migrated, total: external.length })
}
