/**
 * Drawing helpers for various brush types on a 2D canvas context.
 */
import { sampleCanvasColor, mixColors, mixPaint, parseColor, toRgba } from './colorUtils.js'

/**
 * Draw a stroke segment between two points for a given tool.
 * @param {CanvasRenderingContext2D} ctx - where the stroke is drawn (may be a
 *   per-stroke overlay layer for buildup-prone tools)
 * @param {object} from - { x, y, pressure }
 * @param {object} to - { x, y, pressure }
 * @param {object} toolState - { tool, color, size }
 * @param {CanvasRenderingContext2D} [sampleCtx=ctx] - the committed canvas to
 *   sample for wet color mixing (so the brush blends with existing art rather
 *   than its own translucent layer)
 */
export function drawSegment(ctx, from, to, toolState, sampleCtx = ctx) {
  const { tool, color, size } = toolState
  const pressure = to.pressure || 0.5

  switch (tool) {
    case 'pen':
      drawPen(ctx, from, to, color, size, pressure)
      break
    // 'brush' is rendered at the stroke level via drawBrushStroke (path-based,
    // feathered), not per-segment, so it is intentionally absent here.
    case 'watercolor':
      drawWatercolor(ctx, from, to, color, size, pressure)
      break
    case 'marker':
      drawMarker(ctx, from, to, color, size, pressure)
      break
    case 'eraser':
      drawEraser(ctx, from, to, size, pressure)
      break
    default:
      drawPen(ctx, from, to, color, size, pressure)
  }
}

function drawPen(ctx, from, to, color, size, pressure) {
  const lineWidth = size * 0.4 * (0.5 + pressure * 0.5)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 0.9 + pressure * 0.1
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

// Number of concentric passes used to feather the brush edge.
const BRUSH_FEATHER_PASSES = 6

// Frozen radius for a stroke point, from the pressure recorded when it was
// laid down. Keeping it per-point means the committed body of a long stroke
// holds its shape while only the leading edge tracks the current pressure.
function brushRadiusOf(point, size) {
  const pressure = point.pressure != null ? point.pressure : 0.5
  return (size * (0.6 + pressure * 0.4)) / 2
}

// Per-point unit normals (perpendicular to the local tangent) for offsetting
// the ribbon edges. Geometry is frozen with the points; only radii scale per
// feather pass.
function strokeNormals(points) {
  const n = points.length
  const normals = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]
    const c = points[Math.min(n - 1, i + 1)]
    let tx = c.x - a.x
    let ty = c.y - a.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    normals[i] = { x: -ty, y: tx }
  }
  return normals
}

/**
 * Render an entire brush stroke as a feathered ribbon onto its own layer, which
 * is cleared and redrawn each frame. For each feather pass we offset the stroke
 * centerline by a per-point radius to form a ribbon polygon (plus round end
 * caps) and fill it once: the single fill unions everything — no intra-pass
 * stacking, no dark fringe — and the concentric passes (wide+faint to
 * narrow+solid) create the soft edge. The layer is composited once at the brush
 * opacity (see the hook), so retracing never blots.
 *
 * Each point's width is fixed by the pressure recorded when it was laid down,
 * so for a constant-pressure stroke this is identical to a uniform ribbon, and
 * when a kid leans harder partway through only the new leading portion thickens
 * — the already-drawn body keeps its shape.
 *
 * @param {CanvasRenderingContext2D} ctx - the stroke's own full-opacity layer
 * @param {Array<{x:number,y:number,pressure:number}>} points - gated samples so far
 * @param {object} toolState - { color, size }
 * @param {CanvasRenderingContext2D} sampleCtx - committed canvas, for wet mixing
 */
export function drawBrushStroke(ctx, points, toolState, sampleCtx) {
  if (!points || !points.length) return
  const { color, size } = toolState
  const lead = points[points.length - 1]
  const n = points.length

  // Wet mixing: blend with the committed art under the stroke's leading edge so
  // paint laid over existing colour mixes (red over yellow -> orange).
  let paintColor = color
  const sampled = sampleCanvasColor(sampleCtx, lead.x, lead.y, brushRadiusOf(lead, size))
  if (sampled && sampled.a > 20) {
    const beneath = toRgba(sampled.r, sampled.g, sampled.b, sampled.a)
    paintColor = mixColors(color, beneath, 0.25)
  }
  const [r, g, b] = parseColor(paintColor)

  const normals = n > 1 ? strokeNormals(points) : null

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  const passes = BRUSH_FEATHER_PASSES
  for (let k = 0; k < passes; k++) {
    const f = k / (passes - 1) // 0 = outer feather, 1 = core
    const scale = 1 - 0.6 * f // radius scale: full width -> 0.4 * width
    const a = ((k + 1) / passes) ** 2 // faint rim, building to a solid core
    const path = new Path2D()

    if (n === 1) {
      // A tap: concentric circles across the passes make a feathered dot.
      const rad = brushRadiusOf(points[0], size) * scale
      path.moveTo(points[0].x + rad, points[0].y)
      path.arc(points[0].x, points[0].y, rad, 0, Math.PI * 2)
    } else {
      // Ribbon polygon: left edge forward, right edge back. Round end caps are
      // added as full circles so the union gives clean round ends without any
      // cap-angle math.
      for (let i = 0; i < n; i++) {
        const rad = brushRadiusOf(points[i], size) * scale
        const x = points[i].x + normals[i].x * rad
        const y = points[i].y + normals[i].y * rad
        if (i === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      }
      for (let i = n - 1; i >= 0; i--) {
        const rad = brushRadiusOf(points[i], size) * scale
        path.lineTo(points[i].x - normals[i].x * rad, points[i].y - normals[i].y * rad)
      }
      path.closePath()

      const r0 = brushRadiusOf(points[0], size) * scale
      path.moveTo(points[0].x + r0, points[0].y)
      path.arc(points[0].x, points[0].y, r0, 0, Math.PI * 2)
      const rn = brushRadiusOf(lead, size) * scale
      path.moveTo(lead.x + rn, lead.y)
      path.arc(lead.x, lead.y, rn, 0, Math.PI * 2)
    }

    ctx.fillStyle = `rgba(${r},${g},${b},${a})`
    ctx.fill(path)
  }
  ctx.restore()
}

function drawWatercolor(ctx, from, to, color, size, pressure) {
  const lineWidth = size * (0.8 + pressure * 0.5)
  const baseAlpha = 0.1 + pressure * 0.12

  const brush = parseColor(color)
  const brushRgb = [brush[0], brush[1], brush[2]]

  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const steps = Math.max(1, Math.floor(dist / (lineWidth * 0.25)))

  // Sample the wet paint ONCE per segment (small fixed window), not once per
  // dab. The per-dab getImageData readback — and a sample radius that grew with
  // the brush — was the main lag on broad strokes; a segment is short enough
  // that one sample at its midpoint represents it well. Bleed our pigment into
  // whatever is already there via subtractive RYB mixing (red over yellow ->
  // orange, blue over yellow -> green, the way watercolor blends on paper).
  const mx = from.x + dx * 0.5
  const my = from.y + dy * 0.5
  const sampled = sampleCanvasColor(ctx, mx, my, 5)
  let r = brushRgb[0]
  let g = brushRgb[1]
  let b = brushRgb[2]
  let alpha = baseAlpha
  if (sampled && sampled.a > 20) {
    const wetness = Math.min(1, sampled.a / 255)
    const blend = 0.4 + wetness * 0.4 // 0.4..0.8 toward the existing color
    ;[r, g, b] = mixPaint(brushRgb, [sampled.r, sampled.g, sampled.b], blend)
    // Lay the mixed pigment down a touch more opaquely so the new hue reads
    // immediately instead of needing many overlapping passes to surface.
    alpha = baseAlpha * 1.6
  }

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  // Build the dab gradients ONCE per segment at the origin, then stamp each dab
  // by translating the context. Gradient coordinates are resolved through the
  // current transform at paint time, so one gradient can be reused everywhere —
  // far cheaper than allocating a fresh gradient (3 per dab, before) on a slow
  // device.
  const radius = lineWidth * 0.6
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
  core.addColorStop(0, `rgba(${r},${g},${b},${alpha * 1.5})`)
  core.addColorStop(0.5, `rgba(${r},${g},${b},${alpha})`)
  core.addColorStop(1, `rgba(${r},${g},${b},0)`)

  const bleedRadius = radius * 0.8
  const bleed = ctx.createRadialGradient(0, 0, 0, 0, 0, bleedRadius)
  bleed.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.5})`)
  bleed.addColorStop(1, `rgba(${r},${g},${b},0)`)

  const jitter = lineWidth * 0.3
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const px = from.x + dx * t + (Math.random() - 0.5) * jitter
    const py = from.y + dy * t + (Math.random() - 0.5) * jitter

    // Core dab.
    ctx.globalAlpha = 0.6 + Math.random() * 0.4
    ctx.setTransform(1, 0, 0, 1, px, py)
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()

    // One bleed satellite carries the (mixed) pigment outward for the soft,
    // feathered watercolor edge.
    const ang = Math.random() * Math.PI * 2
    const off = radius * (0.4 + Math.random() * 0.6)
    ctx.globalAlpha = 0.3 + Math.random() * 0.3
    ctx.setTransform(1, 0, 0, 1, px + Math.cos(ang) * off, py + Math.sin(ang) * off)
    ctx.fillStyle = bleed
    ctx.beginPath()
    ctx.arc(0, 0, bleedRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore() // also resets the transform back to identity
}

function drawMarker(ctx, from, to, color, size, pressure) {
  const lineWidth = size * 0.8
  const [r, g, b] = parseColor(color)

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'square'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

function drawEraser(ctx, from, to, size, pressure) {
  const lineWidth = size * (0.8 + pressure * 0.4)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.globalAlpha = 0.8
  ctx.strokeStyle = 'rgba(0,0,0,1)'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}
