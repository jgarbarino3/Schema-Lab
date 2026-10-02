function encodePdfString(value: string) {
  return new TextEncoder().encode(value)
}

function concatenateBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const bytes = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }

  return bytes
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function createSingleImagePdfBlob(args: {
  jpegDataUrl: string
  heightPx: number
  widthPx: number
  imageHeightPx?: number
  imageWidthPx?: number
}) {
  const { jpegDataUrl, heightPx, widthPx, imageHeightPx = heightPx, imageWidthPx = widthPx } = args
  const base64 = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '')
  const imageBytes = base64ToBytes(base64)
  const widthPt = Number((widthPx * 0.75).toFixed(2))
  const heightPt = Number((heightPx * 0.75).toFixed(2))
  const imageObjectHeader = encodePdfString(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidthPx} /Height ${imageHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
  )
  const imageObjectFooter = encodePdfString('\nendstream\nendobj\n')
  const contentStream = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`
  const contentBytes = encodePdfString(contentStream)
  const objects = [
    encodePdfString('%PDF-1.4\n'),
    encodePdfString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    encodePdfString('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n'),
    encodePdfString(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
    concatenateBytes([imageObjectHeader, imageBytes, imageObjectFooter]),
    concatenateBytes([
      encodePdfString(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      encodePdfString('endstream\nendobj\n'),
    ]),
  ]

  const offsets: number[] = []
  let position = 0

  for (const object of objects) {
    offsets.push(position)
    position += object.length
  }

  const xrefStart = position
  // The first chunk is the PDF header, not an indirect object.
  const xrefLines = ['xref', `0 ${objects.length}`, '0000000000 65535 f ']

  for (const offset of offsets.slice(1)) {
    xrefLines.push(`${offset.toString().padStart(10, '0')} 00000 n `)
  }

  const trailer = [
    'trailer',
    `<< /Size ${objects.length} /Root 1 0 R >>`,
    'startxref',
    `${xrefStart}`,
    '%%EOF',
  ].join('\n')

  const bytes = concatenateBytes([
    ...objects,
    encodePdfString(`${xrefLines.join('\n')}\n${trailer}`),
  ])

  return new Blob([bytes], { type: 'application/pdf' })
}
