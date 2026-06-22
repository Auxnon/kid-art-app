/**
 * Drawing helpers for various brush types on a 2D canvas context.
 */
import { sampleCanvasColor, mixColors, parseColor, toRgba } from './colorUtils.js'

/**
 * Draw a stroke segment between two points for a given tool.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} from - { x, y, pressure }
 * @param {object} to - { x, y, pressure }
 * @param {object} toolState - { tool, color, size }
 */
export function drawSegment(ctx, from, to, toolState) {
  const { tool, color, size } = toolState
  const pressure = to.pressure || 0.5

  switch (tool) {
    case 'pen':
      drawPen(ctx, from, to, color, size, pressure)
      break
    case 'brush':
      drawBrush(ctx, from, to, color, size, pressure)
      break
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

function drawBrush(ctx, from, to, color, size, pressure) {
  // Soft brush with wet mixing
  const lineWidth = size * (0.6 + pressure * 0.4)
  const alpha = 0.25 + pressure * 0.3

  // Sample canvas color under the brush and mix with current color
  const sampled = sampleCanvasColor(ctx, to.x, to.y, lineWidth * 0.5)
  let paintColor = color
  if (sampled && sampled.a > 20) {
    const canvasHex = toRgba(sampled.r, sampled.g, sampled.b, sampled.a)
    paintColor = mixColors(color, canvasHex, 0.25)
  }

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = alpha

  // Create radial gradient for soft brush
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const steps = Math.max(1, Math.floor(dist / (lineWidth * 0.3)))

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = from.x + dx * t
    const y = from.y + dy * t
    const grad = ctx.createRadialGradient(x, y, 0, x, y, lineWidth * 0.5)
    grad.addColorStop(0, paintColor)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, lineWidth * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawWatercolor(ctx, from, to, color, size, pressure) {
  const lineWidth = size * (0.8 + pressure * 0.5)
  const alpha = 0.08 + pressure * 0.12

  const [r, g, b] = parseColor(color)
  const jitter = lineWidth * 0.3

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const steps = Math.max(1, Math.floor(dist / (lineWidth * 0.2)))

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const cx = from.x + dx * t + (Math.random() - 0.5) * jitter
    const cy = from.y + dy * t + (Math.random() - 0.5) * jitter
    const radius = lineWidth * (0.5 + Math.random() * 0.5)

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 1.5})`)
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)

    ctx.fillStyle = grad
    ctx.globalAlpha = 0.6 + Math.random() * 0.4
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
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
