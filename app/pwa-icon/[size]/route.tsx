import { ImageResponse } from 'next/og'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: sizeStr } = await params
  const size = parseInt(sizeStr) || 192
  const fontSize = size * 0.5

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #1A0A12 0%, #0A0A0A 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: size * 0.22,
        }}
      >
        <div style={{ fontSize, lineHeight: 1 }}>🎭</div>
      </div>
    ),
    { width: size, height: size }
  )
}
