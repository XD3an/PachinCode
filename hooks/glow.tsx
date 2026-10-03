import type { ClientModule } from 'claude-code'

import type { GlowProps } from '../types'

type GlowState = { frame: number }

const COLORS: Record<GlowProps['mode'], readonly string[]> = {
  fever: ['#ffd700', '#ff4d4d', '#00e5ff', '#d14dff'],
  kakuhen: ['#ff1a1a', '#7a0000'],
  next: ['#ff3b3b', '#5a0000'],
}

/** A one-row band that pulses: red for kakuhen, neon for the fever. */
const Glow: ClientModule<GlowProps, GlowState> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.every(300, () => surface.setState({ frame: (surface.state?.frame ?? 0) + 1 }))
  }
  const frame = surface.state?.frame ?? 0
  const colors = COLORS[props.mode]
  const color = colors[frame % colors.length] ?? '#ff3b3b'
  const lamp = frame % 2 === 0 ? '◆' : '◇'

  return (
    <Text bold color="#ffffff" backgroundColor={color} wrap="truncate">
      {` ${lamp} ${props.text} ${lamp} `}
    </Text>
  )
}

export default Glow
