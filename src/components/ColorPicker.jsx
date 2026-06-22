import { useState, useRef, useCallback, useEffect } from 'react'
import { rgbToHex } from '../utils/colorUtils.js'
import './ColorPicker.scss'

// Preset palette grouped by hue families
const PALETTE = [
  // Warm reds/oranges
  '#FF0000', '#FF3333', '#FF6600', '#FF9900', '#FFCC00',
  // Yellows/greens
  '#FFFF00', '#CCFF00', '#66FF00', '#00CC00', '#00FF66',
  // Cool blues/purples
  '#00FFCC', '#00CCFF', '#0099FF', '#0044FF', '#6600FF',
  // Pinks/magentas
  '#CC00FF', '#FF00CC', '#FF0066', '#FF6699', '#FFAABB',
  // Browns/skin tones
  '#8B4513', '#A0522D', '#CD853F', '#DEB887', '#F4A460',
  // Neutrals
  '#000000', '#444444', '#888888', '#BBBBBB', '#FFFFFF',
]

/**
 * ColorPicker - can be used simultaneously with drawing.
 * Supports multi-touch: the color picker handles pointer events with stopPropagation
 * so it doesn't interfere with drawing fingers.
 *
 * Props:
 *   color: string (current color)
 *   onChange(newColor): called when color changes
 *   onClose(): called when picker is dismissed
 */
export default function ColorPicker({ color, onChange, onClose }) {
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(100)
  const [lightness, setLightness] = useState(50)
  const [activeTab, setActiveTab] = useState('palette')

  const svRef = useRef(null)
  const hueRef = useRef(null)
  const isDraggingSV = useRef(false)
  const isDraggingHue = useRef(false)

  // Sync hsl from incoming color prop
  useEffect(() => {
    if (!color) return
    const [h, s, l] = hexToHsl(color)
    setHue(h)
    setSaturation(s)
    setLightness(l)
  }, [color])

  const emitHsl = useCallback(
    (h, s, l) => {
      const hex = hslToHex(h, s, l)
      onChange(hex)
    },
    [onChange],
  )

  // SV picker pointer handling
  const onSVDown = useCallback((e) => {
    e.stopPropagation()
    isDraggingSV.current = true
    updateSV(e)
    svRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const updateSV = useCallback(
    (e) => {
      if (!svRef.current) return
      const rect = svRef.current.getBoundingClientRect()
      const s = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
      const v = Math.min(100, Math.max(0, (1 - (e.clientY - rect.top) / rect.height) * 100))
      // Convert HSV → HSL: L = V*(1 - S/2), S_hsl = (V - L) / min(L, 1-L)
      const l = v / 2 - (s * v) / 200
      const newS = v === 0 ? 0 : (s * v) / (100 - Math.abs(2 * l - 100) + 0.001)
      setSaturation(Math.round(Math.min(100, newS)))
      setLightness(Math.round(l))
      emitHsl(hue, Math.min(100, newS), l)
    },
    [hue, emitHsl],
  )

  const onSVMove = useCallback(
    (e) => {
      e.stopPropagation()
      if (!isDraggingSV.current) return
      updateSV(e)
    },
    [updateSV],
  )

  const onSVUp = useCallback((e) => {
    e.stopPropagation()
    isDraggingSV.current = false
  }, [])

  // Hue slider pointer handling
  const onHueDown = useCallback((e) => {
    e.stopPropagation()
    isDraggingHue.current = true
    updateHue(e)
    hueRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const updateHue = useCallback(
    (e) => {
      if (!hueRef.current) return
      const rect = hueRef.current.getBoundingClientRect()
      const h = Math.min(359, Math.max(0, ((e.clientX - rect.left) / rect.width) * 360))
      setHue(Math.round(h))
      emitHsl(Math.round(h), saturation, lightness)
    },
    [saturation, lightness, emitHsl],
  )

  const onHueMove = useCallback(
    (e) => {
      e.stopPropagation()
      if (!isDraggingHue.current) return
      updateHue(e)
    },
    [updateHue],
  )

  const onHueUp = useCallback((e) => {
    e.stopPropagation()
    isDraggingHue.current = false
  }, [])

  const currentHex = hslToHex(hue, saturation, lightness)

  return (
    <div
      className="color-picker"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="color-picker__header">
        <div className="color-picker__preview" style={{ background: currentHex }} />
        <div className="color-picker__tabs">
          <button
            className={`tab-btn ${activeTab === 'palette' ? 'active' : ''}`}
            onPointerDown={(e) => { e.stopPropagation(); setActiveTab('palette') }}
          >
            Palette
          </button>
          <button
            className={`tab-btn ${activeTab === 'wheel' ? 'active' : ''}`}
            onPointerDown={(e) => { e.stopPropagation(); setActiveTab('wheel') }}
          >
            Custom
          </button>
        </div>
        {onClose && (
          <button className="color-picker__close" onPointerDown={(e) => { e.stopPropagation(); onClose() }}>
            ✕
          </button>
        )}
      </div>

      {activeTab === 'palette' && (
        <div className="color-picker__palette">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`palette-swatch ${c === color ? 'active' : ''}`}
              style={{ background: c, borderColor: c === '#FFFFFF' ? '#ccc' : c }}
              onPointerDown={(e) => { e.stopPropagation(); onChange(c) }}
              aria-label={c}
            />
          ))}
        </div>
      )}

      {activeTab === 'wheel' && (
        <div className="color-picker__custom">
          {/* Saturation-Lightness picker */}
          <div
            ref={svRef}
            className="sv-picker"
            style={{
              background: `linear-gradient(to bottom, transparent, #000),
                           linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
            }}
            onPointerDown={onSVDown}
            onPointerMove={onSVMove}
            onPointerUp={onSVUp}
            onPointerCancel={onSVUp}
          >
            <div
              className="sv-picker__thumb"
              style={{
                left: `${saturation}%`,
                top: `${100 - lightness * 2}%`,
              }}
            />
          </div>
          {/* Hue slider */}
          <div
            ref={hueRef}
            className="hue-slider"
            onPointerDown={onHueDown}
            onPointerMove={onHueMove}
            onPointerUp={onHueUp}
            onPointerCancel={onHueUp}
          >
            <div
              className="hue-slider__thumb"
              style={{ left: `${(hue / 360) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- HSL helpers ----
function hslToHex(h, s, l) {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    const col = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * col)
  }
  return rgbToHex(f(0), f(8), f(4))
}

function hexToHsl(hex) {
  let r = 0, g = 0, b = 0
  if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16) / 255
    g = parseInt(hex.slice(3, 5), 16) / 255
    b = parseInt(hex.slice(5, 7), 16) / 255
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}
