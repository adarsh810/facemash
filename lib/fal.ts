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
    const result = await withTimeout(
      fal.subscribe('fal-ai/face-swap', {
        input: {
          base_image_url: photoUrls[1],
          swap_image_url: photoUrls[0],
        },
      }) as Promise<{ image?: { url: string }; images?: Array<{ url: string }> }>,
      38000,
      null
    )

    const url = result?.image?.url ?? result?.images?.[0]?.url
    if (url) return url
    throw new Error('No image URL in response')
  } catch (error) {
    console.error('fal.ai face-swap error:', error)
    return photoUrls[0]
  }
}
