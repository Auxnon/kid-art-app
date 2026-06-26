import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useMultiTouchCanvas } from '../hooks/useMultiTouchCanvas.js'
import './Canvas.scss'

/**
 * DrawingCanvas - a full-screen canvas supporting any number of simultaneous
 * pointer touches. Each pointer is tracked independently.
 *
 * Props:
 *   getToolState(pointerId) -> { tool, color, size }
 *   onResize() - called when canvas is resized
 */
const DrawingCanvas = forwardRef(function DrawingCanvas({ getToolState }, ref) {
  const canvasRef = useRef(null)
  // Overlay canvas that holds the in-progress stroke at full opacity. It is
  // composited over the committed canvas once per frame and baked down when the
  // stroke ends, so overlapping dabs within a stroke can't build up ("blot").
  const liveCanvasRef = useRef(null)
  const containerRef = useRef(null)

  // Expose canvas ref and clear method to parent
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    clear: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const live = liveCanvasRef.current
      if (live) live.getContext('2d').clearRect(0, 0, live.width, live.height)
    },
    save: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const link = document.createElement('a')
      link.download = 'kid-art.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    },
  }))

  // Resize canvas to fill container, preserving pixel content
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Snapshot current drawing
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = canvas.width
    tmpCanvas.height = canvas.height
    tmpCanvas.getContext('2d').drawImage(canvas, 0, 0)

    // Resize
    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    // Keep the live overlay the same pixel size (its content is transient).
    const live = liveCanvasRef.current
    if (live) {
      live.width = canvas.width
      live.height = canvas.height
      live.style.width = `${w}px`
      live.style.height = `${h}px`
    }

    // Restore drawing
    if (tmpCanvas.width > 0 && tmpCanvas.height > 0) {
      canvas
        .getContext('2d', { willReadFrequently: true })
        .drawImage(tmpCanvas, 0, 0, canvas.width, canvas.height)
    }
  }, [])

  useEffect(() => {
    resizeCanvas()
    const ro = new ResizeObserver(resizeCanvas)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [resizeCanvas])

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } =
    useMultiTouchCanvas(canvasRef, getToolState, liveCanvasRef)

  return (
    <div className="canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ touchAction: 'none', cursor: 'crosshair' }}
      />
      {/* Live stroke overlay — sits above the committed canvas, never receives
          pointer events (they pass through to the canvas below). */}
      <canvas ref={liveCanvasRef} className="drawing-canvas live-layer" />
    </div>
  )
})

export default DrawingCanvas
