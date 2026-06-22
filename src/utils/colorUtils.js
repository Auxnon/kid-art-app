/**
 * Color mixing utilities for the kid art canvas.
 * Implements subtractive (paint-like) color mixing and wet-brush blending.
 */

/**
 * Parse a CSS hex/rgb color string into [r, g, b, a] 0-255 components.
 */
export function parseColor(color) {
  if (!color) return [0, 0, 0, 255]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2], d[3]]
}

/**
 * Convert [r, g, b] (0-255) to hex string.
 */
export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Subtractive (pigment) color mixing. Blends two colors like real paint.
 * Uses the Kubelka-Munk approximation simplified to RYB-like mixing.
 * ratio: 0 = full colorA, 1 = full colorB
 */
export function mixColors(colorA, colorB, ratio = 0.5) {
  const [r1, g1, b1] = parseColor(colorA)
  const [r2, g2, b2] = parseColor(colorB)

  // Subtractive mixing: multiply reflectances (treat as 0-1 values)
  const mix = (a, b) => {
    const ra = a / 255
    const rb = b / 255
    // Weighted geometric mean (approximates subtractive mixing)
    const subtractive = Math.sqrt(ra * rb)
    const additive = ra * (1 - ratio) + rb * ratio
    // Blend between additive and subtractive
    return Math.round((additive * 0.3 + subtractive * 0.7) * 255)
  }

  return rgbToHex(mix(r1, r2), mix(g1, g2), mix(b1, b2))
}

/**
 * Sample the average color from the canvas at a point with given radius.
 */
export function sampleCanvasColor(ctx, x, y, radius = 4) {
  const r = Math.max(1, Math.floor(radius))
  // Clamp sample rect to canvas bounds to avoid DOMException near edges
  const sx = Math.max(0, Math.round(x - r))
  const sy = Math.max(0, Math.round(y - r))
  const sw = Math.min(ctx.canvas.width - sx, r * 2)
  const sh = Math.min(ctx.canvas.height - sy, r * 2)
  if (sw <= 0 || sh <= 0) return null
  try {
    const imageData = ctx.getImageData(sx, sy, sw, sh)
    const data = imageData.data
    let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      if (a > 10) {
        rSum += data[i]
        gSum += data[i + 1]
        bSum += data[i + 2]
        aSum += a
        count++
      }
    }
    if (count === 0) return null
    return {
      r: Math.round(rSum / count),
      g: Math.round(gSum / count),
      b: Math.round(bSum / count),
      a: Math.round(aSum / count),
    }
  } catch {
    return null
  }
}

/**
 * Returns a CSS rgba string.
 */
export function toRgba(r, g, b, a = 255) {
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
}
