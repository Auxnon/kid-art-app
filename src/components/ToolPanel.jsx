import './ToolPanel.scss'

export const TOOLS = [
  { id: 'pen',        icon: '✒️',  label: 'Pen',    defaultSize: 6  },
  { id: 'brush',      icon: '🖌️', label: 'Brush',  defaultSize: 20 },
  { id: 'watercolor', icon: '💧',  label: 'Water',  defaultSize: 24 },
  { id: 'marker',     icon: '🖍️', label: 'Marker', defaultSize: 18 },
  { id: 'eraser',     icon: '⬜',  label: 'Eraser', defaultSize: 24 },
]

const SIZE_MIN = 2
const SIZE_MAX = 80

/**
 * ToolPanel - iOS Paper-style floating tool panel.
 * Supports pointer events so it can be used while another finger draws.
 *
 * Props:
 *   activeTool: string
 *   color: string (hex)
 *   size: number
 *   onToolChange(toolId)
 *   onSizeChange(size)
 *   onColorPickerOpen()
 *   onClear()
 *   onSave()
 */
export default function ToolPanel({
  activeTool,
  color,
  size,
  onToolChange,
  onSizeChange,
  onColorPickerOpen,
  onClear,
  onSave,
}) {
  return (
    <div
      className="tool-panel"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* Tool selector */}
      <div className="tool-panel__tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${activeTool === t.id ? 'active' : ''}`}
            onPointerDown={(e) => { e.stopPropagation(); onToolChange(t.id) }}
            title={t.label}
            aria-label={t.label}
            aria-pressed={activeTool === t.id}
          >
            <span className="tool-btn__icon">{t.icon}</span>
            <span className="tool-btn__label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="tool-panel__divider" />

      {/* Color swatch opens color picker */}
      <div className="tool-panel__color-row">
        <button
          className="color-swatch"
          style={{ background: color }}
          onPointerDown={(e) => { e.stopPropagation(); onColorPickerOpen() }}
          title="Pick color"
          aria-label="Open color picker"
        />
        <div className="color-swatch__label">Color</div>
      </div>

      {/* Brush size slider */}
      <div className="tool-panel__size-row">
        <span className="size-label">Size</span>
        <div className="size-track">
          <input
            type="range"
            min={SIZE_MIN}
            max={SIZE_MAX}
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
            className="size-slider"
            aria-label="Brush size"
          />
        </div>
        <div className="size-preview">
          <div
            className="size-dot"
            style={{
              width: `${Math.min(size, 40)}px`,
              height: `${Math.min(size, 40)}px`,
              background: activeTool === 'eraser' ? '#ccc' : color,
            }}
          />
        </div>
      </div>

      <div className="tool-panel__divider" />

      {/* Actions */}
      <div className="tool-panel__actions">
        <button
          className="action-btn action-btn--clear"
          onPointerDown={(e) => { e.stopPropagation(); onClear() }}
          title="Clear canvas"
          aria-label="Clear canvas"
        >
          🗑️ Clear
        </button>
        <button
          className="action-btn action-btn--save"
          onPointerDown={(e) => { e.stopPropagation(); onSave() }}
          title="Save image"
          aria-label="Save image"
        >
          💾 Save
        </button>
      </div>
    </div>
  )
}
