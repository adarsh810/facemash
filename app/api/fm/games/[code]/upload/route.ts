import { createServerClient } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const formData = await request.formData()

    const photo = formData.get('photo') as File | null
    const photoIndex = parseInt(formData.get('photoIndex') as string)
    const prompt = formData.get('prompt') as string
    const playerId = formData.get('playerId') as string

    if (!photo || !playerId) {
      return Response.json({ error: 'photo and playerId required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Verify game exists
    const { data: game } = await supabase
      .from('fm_games')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle()

    if (!game) {
      return Response.json({ error: 'Game not found' }, { status: 404 })
    }

    // Upload to storage
    const arrayBuffer = await photo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'
    const contentType = photo.type || 'image/jpeg'
    const filePath = `${code.toUpperCase()}/${playerId}/${photoIndex}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('facemash-photos')
      .upload(filePath, buffer, { contentType, upsert: true })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return Response.json({ error: 'Failed to upload photo' }, { status: 500 })
    }

    const { data: publicUrlData } = supabase.storage
      .from('facemash-photos')
      .getPublicUrl(filePath)

    const photoUrl = publicUrlData.publicUrl

    // Insert photo record
    const { data: photoRecord, error: photoError } = await supabase
      .from('fm_photos')
      .insert({
        game_id: game.id,
        player_id: playerId,
        photo_url: photoUrl,
        photo_index: photoIndex,
        prompt: prompt || '',
      })
      .select()
      .single()

    if (photoError || !photoRecord) {
      console.error('Photo insert error:', photoError)
      return Response.json({ error: 'Failed to save photo record' }, { status: 500 })
    }

    return Response.json({ photoId: photoRecord.id, photoUrl })
  } catch (error) {
    console.error('POST /api/fm/games/[code]/upload error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
