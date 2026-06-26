import { useRef, useCallback, useEffect } from 'react'
import { drawSegment, drawBrushStroke } from '../utils/drawingUtils.js'

// Tools that build up opacity from overlapping soft dabs are drawn onto a
// per-stroke layer at full opacity and composited onto the canvas ONCE, so
// overlapping dabs within a stroke can't compound into blots. Other tools
// (pen, marker, eraser, watercolor washes) draw straight to the canvas.
const LAYER_TOOLS = new Set(['brush'])
// Opacity the finished brush layer is composited at.
const BRUSH_LAYER_ALPHA = 0.8

/**
 * useMultiTouchCanvas - manages multiple simultaneous pointer strokes.
 * Each pointer (finger/stylus) is tracked independently by pointerId.
 *
 * Paint is deposited by DISTANCE TRAVELLED, not by event count, and drawing is
 * batched into one requestAnimationFrame tick (see flush). On top of that,
 * buildup-prone brushes render to a per-stroke overlay layer that is composited
 * once, so neither the event storm nor overlapping dabs cause blotting.
 *
 * @param {React.RefObject} canvasRef - committed drawing canvas
 * @param {function} getToolState - returns { tool, color, size } for a pointerId
 * @param {React.RefObject} liveCanvasRef - overlay canvas for in-progress strokes
 */
export function useMultiTouchCanvas(canvasRef, getToolState, liveCanvasRef) {
  // pointerId -> { x, y, pressure } : the last point actually painted.
  const anchors = useRef(new Map())
  // pointerId -> array of raw samples captured since the last frame flush.
  const queues = useRef(new Map())
  // pointerId -> { canvas, ctx, alpha } : per-stroke layer for buildup tools.
  const layers = useRef(new Map())
  const rafId = useRef(0)

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    // Wet brushes sample the raster every dab; this keeps readback on a fast path.
    return canvas.getContext('2d', { willReadFrequently: true })
  }, [canvasRef])

  const getLiveCtx = useCallback(() => {
    const live = liveCanvasRef && liveCanvasRef.current
    return live ? live.getContext('2d') : null
  }, [liveCanvasRef])

  const getCanvasPoint = useCallback(
    (e) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0, pressure: 0.5 }
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        pressure: e.pressure != null ? e.pressure : 0.5,
      }
    },
    [canvasRef],
  )

  // Distance below which a brush of this size shouldn't lay down a fresh dab.
  // Scales with brush size so big brushes don't over-deposit, with a small
  // floor so fine tools still register slow movement.
  const minSpacing = (toolState) =>
    toolState ? Math.max(1.2, toolState.size * 0.12) : 2

  // Lazily create the overlay layer canvas for a buildup-tool stroke.
  const ensureLayer = useCallback((pointerId) => {
    let layer = layers.current.get(pointerId)
    if (layer) return layer
    const main = canvasRef.current
    const c = document.createElement('canvas')
    c.width = main ? main.width : 0
    c.height = main ? main.height : 0
    // points: the gated stroke samples, redrawn as one feathered path each frame.
    layer = { canvas: c, ctx: c.getContext('2d'), alpha: BRUSH_LAYER_ALPHA, points: [] }
    layers.current.set(pointerId, layer)
    return layer
  }, [canvasRef])

  // Redraw the overlay = all active stroke layers, each at its stroke opacity.
  const recompositeLive = useCallback(() => {
    const live = getLiveCtx()
    if (!live) return
    live.clearRect(0, 0, live.canvas.width, live.canvas.height)
    for (const layer of layers.current.values()) {
      live.globalAlpha = layer.alpha
      live.drawImage(layer.canvas, 0, 0)
    }
    live.globalAlpha = 1
  }, [getLiveCtx])

  // Drain each pointer's queued samples, emitting evenly spaced segments.
  const flush = useCallback(() => {
    rafId.current = 0
    const ctx = getCtx()
    if (!ctx) return

    for (const [pointerId, pts] of queues.current) {
      if (!pts.length) continue
      const toolState = getToolState(pointerId)
      const useLayer = toolState && LAYER_TOOLS.has(toolState.tool)
      const layer = useLayer ? ensureLayer(pointerId) : null
      let anchor = anchors.current.get(pointerId) || pts[0]
      const spacing = minSpacing(toolState)
      const spacingSq = spacing * spacing
      let added = false

      for (const p of pts) {
        const dx = p.x - anchor.x
        const dy = p.y - anchor.y
        if (dx * dx + dy * dy >= spacingSq) {
          if (layer) {
            // Accumulate the point; the whole stroke is redrawn as one path below.
            layer.points.push(p)
            added = true
          } else if (toolState) {
            drawSegment(ctx, anchor, p, toolState)
          }
          anchor = p
        }
      }
      anchors.current.set(pointerId, anchor)
      // Redraw the feathered path once per frame, after all new points are in.
      if (layer && added) drawBrushStroke(layer.ctx, layer.points, toolState, ctx)
      pts.length = 0
    }

    if (layers.current.size) recompositeLive()
  }, [getCtx, getToolState, ensureLayer, recompositeLive])

  const schedule = useCallback(() => {
    if (!rafId.current) rafId.current = requestAnimationFrame(flush)
  }, [flush])

  const onPointerDown = useCallback(
    (e) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Capture pointer so moves are received even if finger leaves element
      canvas.setPointerCapture(e.pointerId)

      const point = getCanvasPoint(e)
      anchors.current.set(e.pointerId, point)
      queues.current.set(e.pointerId, [])

      // Stamp a single dab so a tap (no movement) still leaves a mark.
      const toolState = getToolState(e.pointerId)
      const ctx = getCtx()
      if (!ctx || !toolState) return
      if (LAYER_TOOLS.has(toolState.tool)) {
        const layer = ensureLayer(e.pointerId)
        layer.points.push(point)
        drawBrushStroke(layer.ctx, layer.points, toolState, ctx)
        recompositeLive()
      } else {
        drawSegment(ctx, point, point, toolState)
      }
    },
    [canvasRef, getCanvasPoint, getToolState, getCtx, ensureLayer, recompositeLive],
  )

  const onPointerMove = useCallback(
    (e) => {
      const q = queues.current.get(e.pointerId)
      if (!q) return

      // Coalesced events recover the sub-frame path on fast strokes; falling
      // back to the single event when the API is unavailable.
      const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : null
      if (coalesced && coalesced.length) {
        for (const ce of coalesced) q.push(getCanvasPoint(ce))
      } else {
        q.push(getCanvasPoint(e))
      }
      schedule()
    },
    [getCanvasPoint, schedule],
  )

  const finishPointer = useCallback(
    (e) => {
      const q = queues.current.get(e.pointerId)
      const last = q && q.length ? q[q.length - 1] : null

      // Drain any still-queued samples through the normal distance-gated path
      // (catches a fast final flick), then...
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = 0
      }
      flush()

      const ctx = getCtx()
      const toolState = getToolState(e.pointerId)
      const anchor = anchors.current.get(e.pointerId)
      const layer = layers.current.get(e.pointerId)

      // ...end the stroke exactly at the finger, even if that last move was
      // below the spacing threshold.
      if (toolState && anchor && last && (last.x !== anchor.x || last.y !== anchor.y)) {
        if (layer) {
          layer.points.push(last)
          drawBrushStroke(layer.ctx, layer.points, toolState, ctx)
        } else if (ctx) {
          drawSegment(ctx, anchor, last, toolState)
        }
      }

      // Bake the finished stroke layer into the committed canvas at its opacity,
      // then drop it and refresh the overlay (removing this baked stroke).
      if (layer && ctx) {
        ctx.save()
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = layer.alpha
        ctx.drawImage(layer.canvas, 0, 0)
        ctx.restore()
        layers.current.delete(e.pointerId)
        recompositeLive()
      }

      anchors.current.delete(e.pointerId)
      queues.current.delete(e.pointerId)
    },
    [flush, getCtx, getToolState, recompositeLive],
  )

  const onPointerUp = useCallback(
    (e) => {
      finishPointer(e)
      const canvas = canvasRef.current
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId)
      }
    },
    [canvasRef, finishPointer],
  )

  const onPointerCancel = useCallback((e) => finishPointer(e), [finishPointer])

  // Cancel any pending frame on unmount.
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
