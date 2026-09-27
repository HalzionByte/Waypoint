import type { LandmarkAction } from '../api/types'

interface ActionMeta {
  value: LandmarkAction
  label: string
  icon: string
}

/** Short instruction presets, in the plain local wording the PRD describes. */
export const ACTIONS: ActionMeta[] = [
  { value: 'start', label: 'Start here', icon: '◎' },
  { value: 'pass', label: 'Pass it', icon: '→' },
  { value: 'continue', label: 'Continue', icon: '↑' },
  { value: 'turn_left', label: 'Turn left', icon: '←' },
  { value: 'turn_right', label: 'Turn right', icon: '→' },
  { value: 'turn_back', label: 'Turn back', icon: '↺' },
  { value: 'enter', label: 'Enter', icon: '⌸' },
  { value: 'exit', label: 'Exit', icon: '⇥' },
  { value: 'cross', label: 'Cross', icon: '⇄' },
  { value: 'destination', label: 'Destination', icon: '★' },
  { value: 'other', label: 'Other', icon: '•' },
]

const BY_VALUE = new Map(ACTIONS.map((a) => [a.value, a]))

export function actionLabel(action: LandmarkAction): string {
  return BY_VALUE.get(action)?.label ?? 'Other'
}

export function actionIcon(action: LandmarkAction): string {
  return BY_VALUE.get(action)?.icon ?? '•'
}

/** "Turn left after the brown gate." style default copy from the action type. */
export function instructionTemplate(action: LandmarkAction, name: string): string {
  const trimmed = name.trim()
  switch (action) {
    case 'start':
      return trimmed ? `Start at the ${trimmed}.` : ''
    case 'pass':
      return trimmed ? `Pass the ${trimmed}.` : ''
    case 'continue':
      return trimmed ? `Continue until you reach the ${trimmed}.` : ''
    case 'turn_left':
      return trimmed ? `Turn left at the ${trimmed}.` : ''
    case 'turn_right':
      return trimmed ? `Turn right at the ${trimmed}.` : ''
    case 'turn_back':
      return trimmed ? `Turn back at the ${trimmed}.` : ''
    case 'enter':
      return trimmed ? `Enter through the ${trimmed}.` : ''
    case 'exit':
      return trimmed ? `Exit at the ${trimmed}.` : ''
    case 'cross':
      return trimmed ? `Cross at the ${trimmed}.` : ''
    case 'destination':
      return trimmed ? `The destination is at the ${trimmed}.` : ''
    default:
      return ''
  }
}
