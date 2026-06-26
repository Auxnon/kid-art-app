/**
 * Color mixing utilities for the kid art canvas.
 * Implements subtractive (paint-like) color mixing and wet-brush blending.
 */

// Reuse one tiny scratch canvas for color parsing, and memoize results — the
// brushes call parseColor on every segment, and allocating a fresh canvas each
// time was a real cost on older tablets.
let _parseCtx = null
const _parseCache = new Map()

/**
 * Parse a CSS hex/rgb color string into [r, g, b, a] 0-255 components.
 */
export function parseColor(color) {
  if (!color) return [0, 0, 0, 255]
  const cached = _parseCache.get(color)
  if (cached) return cached
  if (!_parseCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    _parseCtx = canvas.getContext('2d')
  }
  _parseCtx.clearRect(0, 0, 1, 1)
  _parseCtx.fillStyle = color
  _parseCtx.fillRect(0, 0, 1, 1)
  const d = _parseCtx.getImageData(0, 0, 1, 1).data
  const rgba = [d[0], d[1], d[2], d[3]]
  _parseCache.set(color, rgba)
  return rgba
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
 * Convert an RGB triple (0-255) into the RYB (Red-Yellow-Blue) artists' color
 * space. Mixing pigments is a subtractive process, and RYB is the wheel kids
 * are taught: red + yellow = orange, yellow + blue = green, red + blue = purple.
 * Plain RGB averaging can't produce those — it makes magenta and grey instead.
 *
 * Matched pair of approximations from Gosset & Chen / Sugar & Tang.
 */
export function rgbToRyb(r, g, b) {
  // Pull the shared whiteness out so we mix pure pigment, then add it back.
  const w = Math.min(r, g, b)
  r -= w; g -= w; b -= w
  const maxG = Math.max(r, g, b)

  // Extract the yellow that lives inside the red+green components.
  let y = Math.min(r, g)
  r -= y; g -= y

  // If blue and green coexist, halve them so the value range is preserved.
  if (b > 0 && g > 0) { b /= 2; g /= 2 }

  // Fold the remaining green back into yellow and blue.
  y += g; b += g

  // Renormalize so the brightest channel matches the original.
  const maxY = Math.max(r, y, b)
  if (maxY > 0) {
    const n = maxG / maxY
    r *= n; y *= n; b *= n
  }

  return [r + w, y + w, b + w]
}

/**
 * Inverse of rgbToRyb — convert an RYB pigment color back to displayable RGB.
 */
export function rybToRgb(r, y, b) {
  const w = Math.min(r, y, b)
  r -= w; y -= w; b -= w
  const maxY = Math.max(r, y, b)

  // Extract the green that lives inside the yellow+blue components.
  let g = Math.min(y, b)
  y -= g; b -= g

  if (b > 0 && g > 0) { b *= 2; g *= 2 }

  // Fold the remaining yellow back into red and green.
  r += y; g += y

  const maxG = Math.max(r, g, b)
  if (maxG > 0) {
    const n = maxY / maxG
    r *= n; g *= n; b *= n
  }

  return [r + w, g + w, b + w]
}

const clamp255 = (v) => Math.round(Math.max(0, Math.min(255, v)))

/**
 * Subtractive (pigment) color mixing — blends two RGB colors the way wet paint
 * mixes on paper. Works in RYB space so red+yellow yields orange, etc.
 * ratio: 0 = full rgbA, 1 = full rgbB.
 *
 * @param {number[]} rgbA - [r, g, b] 0-255
 * @param {number[]} rgbB - [r, g, b] 0-255
 * @returns {number[]} mixed [r, g, b] 0-255
 */
export function mixPaint(rgbA, rgbB, ratio = 0.5) {
  const [ar, ay, ab] = rgbToRyb(rgbA[0], rgbA[1], rgbA[2])
  const [br, by, bb] = rgbToRyb(rgbB[0], rgbB[1], rgbB[2])

  const lerp = (x, y) => x * (1 - ratio) + y * ratio
  let [r, g, b] = rybToRgb(lerp(ar, br), lerp(ay, by), lerp(ab, bb))

  // RYB round-tripping darkens mixes (real pigment does too, but less than this
  // approximation). Restore brightness toward the blend of the inputs' values
  // so orange reads as a bright orange rather than a muddy brown.
  const targetMax = lerp(Math.max(...rgbA), Math.max(...rgbB))
  const resultMax = Math.max(r, g, b)
  if (resultMax > 0) {
    const scale = targetMax / resultMax
    r *= scale; g *= scale; b *= scale
  }

  return [clamp255(r), clamp255(g), clamp255(b)]
}

/**
 * Subtractive pigment mixing on CSS color strings, returning a hex string.
 * ratio: 0 = full colorA, 1 = full colorB
 */
export function mixColors(colorA, colorB, ratio = 0.5) {
  const a = parseColor(colorA)
  const b = parseColor(colorB)
  const [r, g, bl] = mixPaint([a[0], a[1], a[2]], [b[0], b[1], b[2]], ratio)
  return rgbToHex(r, g, bl)
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
