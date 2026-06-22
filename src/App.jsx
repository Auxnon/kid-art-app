import { useRef, useState, useCallback } from 'react'
import DrawingCanvas from './components/Canvas.jsx'
import ToolPanel, { TOOLS } from './components/ToolPanel.jsx'
import ColorPicker from './components/ColorPicker.jsx'
import './App.scss'

const DEFAULT_COLOR = '#E53935'
const DEFAULT_TOOL = 'brush'

/**
 * App - Kid Art App
 *
 * Supports simultaneous multi-touch:
 * - Any number of fingers can draw at once
 * - Color picker can be opened and used while another finger is actively drawing
 * - Each user can independently use the tool panel
 *
 * Architecture note: getToolState() always returns the latest tool/color/size so
 * every active pointer benefits from the current settings without stale closures.
 */
export default function App() {
  const canvasRef = useRef(null)

  const [activeTool, setActiveTool] = useState(DEFAULT_TOOL)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [size, setSize] = useState(20)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)

  // Use refs so getToolState callback never becomes stale across pointer lifetimes
  const toolRef = useRef(activeTool)
  const colorRef = useRef(color)
  const sizeRef = useRef(size)
  toolRef.current = activeTool
  colorRef.current = color
  sizeRef.current = size

  // Called by useMultiTouchCanvas for each active pointer on every move
  const getToolState = useCallback((_pointerId) => ({
    tool: toolRef.current,
    color: colorRef.current,
    size: sizeRef.current,
  }), [])

  const handleToolChange = (id) => {
    setActiveTool(id)
    // Restore default size if switching to a different tool
    const t = TOOLS.find((t) => t.id === id)
    if (t) setSize(t.defaultSize)
  }

  const handleClear = () => {
    if (clearConfirm) {
      canvasRef.current?.clear()
      setClearConfirm(false)
    } else {
      setClearConfirm(true)
      setTimeout(() => setClearConfirm(false), 2500)
    }
  }

  const handleSave = () => {
    canvasRef.current?.save()
  }

  return (
    <div className="app">
      {/* Full-screen drawing canvas */}
      <DrawingCanvas ref={canvasRef} getToolState={getToolState} />

      {/* Tool panel - floated left */}
      <div className="app__tool-panel-wrapper">
        <ToolPanel
          activeTool={activeTool}
          color={color}
          size={size}
          onToolChange={handleToolChange}
          onSizeChange={setSize}
          onColorPickerOpen={() => setShowColorPicker((v) => !v)}
          onClear={handleClear}
          onSave={handleSave}
        />
      </div>

      {/* Color picker - floated next to tool panel */}
      {showColorPicker && (
        <div className="app__color-picker-wrapper">
          <ColorPicker
            color={color}
            onChange={setColor}
            onClose={() => setShowColorPicker(false)}
          />
        </div>
      )}

      {/* Clear confirmation toast */}
      {clearConfirm && (
        <div className="app__toast">
          Tap Clear again to erase everything 🗑️
        </div>
      )}

      {/* App title watermark */}
      <div className="app__watermark">🎨 Kid Art</div>
    </div>
  )
}
