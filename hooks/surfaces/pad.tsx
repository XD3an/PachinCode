import type { ClientModule } from 'claude-code'

import type { PadInput } from '../../types'

type PadProps = { columns: number; rows: number }

/**
 * An invisible layer over the machine: it draws nothing, so the Raster beneath shows
 * through, and takes the mouse and keys. Hold the mouse on the machine to fire; once a
 * click has given it the keyboard, Space fires and the arrows turn the handle.
 *
 * It posts running counts, not events: a later post in one frame replaces an earlier
 * one, and counts lose nothing when that happens.
 */
const Pad: ClientModule<PadProps, PadInput> = (props, surface) => {
  const { Box } = surface.elements
  const now = (): PadInput =>
    surface.state ?? { id: Math.random(), isPointerDown: false, space: 0, steps: 0, preset: 0, presetPower: 30 }
  const send = (next: PadInput) => {
    surface.post(next)
    surface.setState(next)
  }

  if (surface.state === undefined) {
    surface.onPointer(event => {
      const s = now()
      if (event.type === 'down' && event.button === 'left') send({ ...s, isPointerDown: true })
      else if (event.type === 'up' && s.isPointerDown) send({ ...s, isPointerDown: false })
    })
    surface.onKey(event => {
      const s = now()
      const key = event.key.toLowerCase()
      if (key === ' ' || key === 'space' || key === 'f' || key === 'return') send({ ...s, space: s.space + 1 })
      else if (key === 'left' || key === 'a') send({ ...s, steps: s.steps - 1 })
      else if (key === 'right' || key === 'd') send({ ...s, steps: s.steps + 1 })
      else if (key === 'l') send({ ...s, preset: s.preset + 1, presetPower: 30 })
      else if (key === 'r') send({ ...s, preset: s.preset + 1, presetPower: 95 })
      else if (key === 's') send({ ...s, preset: s.preset + 1, presetPower: -1 })
    })
    surface.setState(now())
  }

  return <Box width={props.columns} height={props.rows} />
}

export default Pad
