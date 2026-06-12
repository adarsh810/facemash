import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

export async function blendFaces(photoUrls: string[]): Promise<string> {
  if (photoUrls.length === 0) throw new Error('No photos provided')
  if (photoUrls.length === 1) return photoUrls[0]

  try {
    console.log('fal.ai: starting face-swap, photos:', photoUrls.map(u => u.slice(-40)))
    const result = await withTimeout(
      fal.subscribe('fal-ai/face-swap', {
        input: {
          base_image_url: photoUrls[1],
          swap_image_url: photoUrls[0],
        },
      }),
      90000,
      null
    )

    console.log('fal.ai raw result keys:', result ? Object.keys(result as object) : 'null (timeout)')

    // @fal-ai/client v1 wraps output in .data; v0 returns it directly
    const output = (result as any)?.data ?? result
    const url = output?.image?.url ?? output?.images?.[0]?.url
    console.log('fal.ai extracted URL:', url ?? 'none')

    if (url) return url
    throw new Error(`No image URL — raw: ${JSON.stringify(result)?.slice(0, 300)}`)
  } catch (error) {
    console.error('fal.ai face-swap error:', error instanceof Error ? error.message : String(error))
    return photoUrls[0]
  }
}
