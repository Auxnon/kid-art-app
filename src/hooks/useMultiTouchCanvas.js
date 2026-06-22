import { useRef, useCallback } from 'react'
import { drawSegment } from '../utils/drawingUtils.js'

/**
 * useMultiTouchCanvas - manages multiple simultaneous pointer strokes.
 * Each pointer (finger/stylus) is tracked independently by pointerId.
 *
 * @param {React.RefObject} canvasRef - ref to the <canvas> element
 * @param {function} getToolState - returns { tool, color, size } for a given pointerId
 * @param {function} onColorPickerActivate - called when a pointer hits the color picker zone
 */
export function useMultiTouchCanvas(canvasRef, getToolState) {
  // Map of active pointers: pointerId -> { x, y, pressure, lastX, lastY }
  const activePointers = useRef(new Map())

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }, [canvasRef])

  const getCanvasPoint = useCallback(
    (e) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
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

  const onPointerDown = useCallback(
    (e) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Capture pointer so moves are received even if finger leaves element
      canvas.setPointerCapture(e.pointerId)

      const point = getCanvasPoint(e)
      activePointers.current.set(e.pointerId, {
        x: point.x,
        y: point.y,
        pressure: point.pressure,
      })
    },
    [canvasRef, getCanvasPoint],
  )

  const onPointerMove = useCallback(
    (e) => {
      if (!activePointers.current.has(e.pointerId)) return
      const ctx = getCtx()
      if (!ctx) return

      const prev = activePointers.current.get(e.pointerId)
      const point = getCanvasPoint(e)

      const toolState = getToolState(e.pointerId)
      if (toolState) {
        drawSegment(
          ctx,
          { x: prev.x, y: prev.y, pressure: prev.pressure },
          { x: point.x, y: point.y, pressure: point.pressure },
          toolState,
        )
      }

      activePointers.current.set(e.pointerId, {
        x: point.x,
        y: point.y,
        pressure: point.pressure,
      })
    },
    [getCtx, getCanvasPoint, getToolState],
  )

  const onPointerUp = useCallback(
    (e) => {
      activePointers.current.delete(e.pointerId)
      const canvas = canvasRef.current
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId)
      }
    },
    [canvasRef],
  )

  const onPointerCancel = useCallback(
    (e) => {
      activePointers.current.delete(e.pointerId)
    },
    [],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    activePointers,
  }
}
