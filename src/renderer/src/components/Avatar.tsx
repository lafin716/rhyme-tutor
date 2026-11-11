import type { CSSProperties } from 'react'
import type { CharacterPresetId, Emotion } from '@shared/domain'
import { getPreset } from '@shared/presets'
import type { CharacterPreset } from '@shared/presets'
import { cx } from '../lib/cx'

export type AvatarSize = 'sm' | 'md' | 'lg'
const SIZE_PX: Record<AvatarSize, number> = { sm: 36, md: 64, lg: 160 }

interface AvatarProps {
  presetId: CharacterPresetId
  emotion?: Emotion
  size?: AvatarSize
  className?: string
  /** Decorative by default; pass a label when the avatar stands alone. */
  label?: string
}

function Hair({ style, color }: { style: CharacterPreset['look']['hair']; color: string }) {
  switch (style) {
    case 'bob':
      return <path fill={color} d="M35 62Q34 22 60 21Q86 22 85 62L88 84Q60 72 32 84Z" />
    case 'short':
      return <path fill={color} d="M37 56Q38 25 60 25Q82 25 83 56Q72 40 60 40Q48 40 37 56Z" />
    case 'ponytail':
      return (
        <>
          <path fill={color} d="M37 56Q38 25 60 25Q82 25 83 56Q72 40 60 40Q48 40 37 56Z" />
          <path fill={color} d="M80 38Q104 48 96 92Q90 70 78 54Z" />
        </>
      )
    case 'curly':
      return (
        <g fill={color}>
          <circle cx="40" cy="48" r="10" />
          <circle cx="50" cy="32" r="11" />
          <circle cx="66" cy="29" r="11" />
          <circle cx="80" cy="42" r="10" />
          <circle cx="82" cy="60" r="8" />
          <circle cx="38" cy="66" r="7" />
        </g>
      )
  }
}

function Accessory({ kind, accent }: { kind: CharacterPreset['look']['accessory']; accent: string }) {
  switch (kind) {
    case 'none':
      return null
    case 'glasses':
      return (
        <g fill="none" stroke="#1d1f24" strokeWidth={2}>
          <circle cx="51" cy="62" r="7" />
          <circle cx="69" cy="62" r="7" />
          <path d="M58 62h4" />
        </g>
      )
    case 'headband':
      return <path d="M36 44Q60 32 84 44" fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" />
    case 'beret':
      return (
        <g>
          <ellipse cx="56" cy="30" rx="26" ry="9" fill={accent} transform="rotate(-8 56 30)" />
          <circle cx="44" cy="22" r="2.5" fill={accent} />
        </g>
      )
  }
}

function Mouth({ emotion }: { emotion: Emotion }) {
  const stroke = { fill: 'none', stroke: '#3a2a22', strokeWidth: 2, strokeLinecap: 'round' as const }
  if (emotion === 'talking') {
    return <ellipse className="av-mouth" cx="60" cy="78" rx="4.5" ry="3.5" fill="#7a2e2e" />
  }
  if (emotion === 'happy') return <path d="M52 75Q60 85 68 75" {...stroke} />
  if (emotion === 'concerned') return <path d="M54 81Q60 75 66 81" {...stroke} />
  return <path d="M54 77Q60 80 66 77" {...stroke} />
}

/** Pure SVG tutor avatar. Animations are CSS-only and disabled under prefers-reduced-motion. */
export function Avatar({ presetId, emotion = 'idle', size = 'md', className, label }: AvatarProps) {
  const preset = getPreset(presetId)
  const { palette, look } = preset
  const px = SIZE_PX[size]
  const cssVars = { '--av-bg': palette.background } as CSSProperties
  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const }

  return (
    <svg
      data-testid="tutor-avatar"
      data-preset={presetId}
      data-emotion={emotion}
      width={px}
      height={px * (140 / 120)}
      viewBox="0 0 120 140"
      className={cx('av-root', `av-${emotion}`, className)}
      style={cssVars}
      focusable="false"
      {...a11y}
    >
      <rect className="av-bg" x="0" y="0" width="120" height="140" rx="26" />
      <g className="av-figure">
        <g className="av-body">
          <path fill={palette.outfit} d="M26 140V116Q26 94 60 92Q94 94 94 116V140Z" />
          <path fill={palette.accent} d="M52 92L60 104L68 92Z" opacity="0.9" />
          <rect fill={palette.skin} x="53" y="82" width="14" height="12" rx="4" />
        </g>
        <g className="av-head">
          <ellipse fill={palette.skin} cx="60" cy="60" rx="24" ry="26" />
          <Hair style={look.hair} color={palette.hair} />
          <g className="av-eyes">
            <circle cx="51" cy="62" r="2.8" fill="#1d1f24" />
            <circle cx="69" cy="62" r="2.8" fill="#1d1f24" />
          </g>
          <circle cx="45" cy="72" r="3.5" fill="#f08a8a" opacity="0.35" />
          <circle cx="75" cy="72" r="3.5" fill="#f08a8a" opacity="0.35" />
          <Mouth emotion={emotion} />
          <Accessory kind={look.accessory} accent={palette.accent} />
        </g>
      </g>
      <g className="av-thinking-dots" fill={palette.accent}>
        <circle cx="90" cy="30" r="3" />
        <circle cx="98" cy="22" r="3" />
        <circle cx="106" cy="14" r="3" />
      </g>
    </svg>
  )
}
