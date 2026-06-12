import { createServerClient } from '@/lib/supabase-server'
import { blendFaces } from '@/lib/fal'

export const maxDuration = 120

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const { mixId } = await request.json()

  if (!mixId) return Response.json({ error: 'mixId required' }, { status: 400 })

  const supabase = createServerClient()

  // Fetch mix — only proceed if pending
  const { data: mixRaw } = await supabase
    .from('fm_round_mixes')
    .select('*')
    .eq('id', mixId)
    .maybeSingle()

  const mix = mixRaw as { id: string; status: string; photo_ids: string[]; game_id: string } | null
  if (!mix) return Response.json({ error: 'Mix not found' }, { status: 404 })
  if (mix.status !== 'pending') return Response.json({ status: mix.status })

  // Mark generating (atomic guard against double-calls)
  const { error: guardErr } = await supabase
    .from('fm_round_mixes')
    .update({ status: 'generating' })
    .eq('id', mixId)
    .eq('status', 'pending')

  if (guardErr) return Response.json({ status: 'already_generating' })

  // Fetch photo URLs
  const { data: photosRaw } = await supabase
    .from('fm_photos')
    .select('id, photo_url')
    .in('id', mix.photo_ids)

  const photos = (photosRaw || []) as { id: string; photo_url: string }[]
  const photoUrls = mix.photo_ids
    .map((pid) => photos.find((p) => p.id === pid)?.photo_url)
    .filter(Boolean) as string[]

  try {
    const mixedUrl = await blendFaces(photoUrls)
    await supabase
      .from('fm_round_mixes')
      .update({ mixed_photo_url: mixedUrl, status: 'ready' })
      .eq('id', mixId)
    return Response.json({ success: true, url: mixedUrl })
  } catch (error) {
    console.error(`generate-mix [${code}] failed:`, error)
    await supabase
      .from('fm_round_mixes')
      .update({ status: 'failed' })
      .eq('id', mixId)
    return Response.json({ error: 'Generation failed' }, { status: 500 })
  }
}
