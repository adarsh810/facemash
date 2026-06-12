import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

interface PulidOutput {
  images?: Array<{ url: string }>
}

export async function blendFaces(photoUrls: string[]): Promise<string> {
  try {
    // Use PuLID which directly accepts image URLs and can mix multiple face identities
    const referenceImages = photoUrls.map((url) => ({ image_url: url }))

    const result = (await fal.subscribe('fal-ai/pulid', {
      input: {
        prompt:
          'a portrait photo of a person, photorealistic, studio lighting, high quality, natural skin',
        reference_images: referenceImages,
        id_mix: true,
        num_images: 1,
        image_size: 'square_hd',
        num_inference_steps: 4,
        guidance_scale: 1.2,
        id_scale: 0.8,
        negative_prompt:
          'low quality, worst quality, blurry, artifacts, watermark, deformed, ugly',
      },
    })) as PulidOutput

    if (result && result.images && result.images.length > 0) {
      return result.images[0].url
    }

    throw new Error('No image returned from fal.ai PuLID')
  } catch (error) {
    console.error('fal.ai blendFaces error:', error)
    // Fallback: return the first photo URL
    return photoUrls[0]
  }
}
