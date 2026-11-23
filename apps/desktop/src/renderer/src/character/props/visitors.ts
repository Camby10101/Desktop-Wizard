// Her visitors: the little spirit that comes to see her.

import type { Scene } from './kit'
import { SPARKLE, TWINKLE, stage } from './kit'

/**
 * The little spirit, wings up and wings down: a round glowing body (mint and teal) with dark dot
 * eyes, pale leaf wings, and a wisp of a tail.
 */
export const SPIRIT_FLAP = [
  [
    '.VV.......VV.',
    'VVVV.....VVVV',
    '.VVV.TTT.VVV.',
    '..VVTUUUTVV..',
    '...TUUUUUT...',
    '...TUWUWUT...',
    '...TUUUUUT...',
    '....TUUUT....',
    '.....TTT.....',
    '......T......',
  ],
  [
    '.............',
    '.............',
    '.....TTT.....',
    '....TUUUT....',
    '...TUUUUUT...',
    'VVVTUWUWUTVVV',
    'VVVTUUUUUTVVV',
    '.VVVTUUUTVVV.',
    '..V..TTT..V..',
    '......T......',
  ],
]

/**
 * The little spirit's visit (Pose.spirit): appearing beside her, flying to her, on her palm, a
 * loop round her head, waving, and gone (shares of the habit).
 */
export const SPIRIT = {
  appear: [0.02, 0.12],
  toHer: [0.12, 0.28],
  land: [0.3, 0.56],
  loop: [0.58, 0.78],
  wave: [0.8, 0.9],
  gone: [0.9, 0.99],
} as const

/**
 * The little spirit: appears beside her in a sparkle, flies to her, lands on her palm, loops
 * round her head (behind her on the far side), hovers beside her waving, and fades away.
 */
export function paintSpirit({ pose, canvas, set, hand, onHead }: Scene): void {
  const spirit = pose.spirit ?? 0
  if (spirit > 0 && spirit < 1) {
    const head = onHead({ x: 0, y: -4 })
    const beside = { x: head.x + 27, y: head.y + 6 }
    const before = { x: head.x + 10, y: head.y + 10 }
    const palm = { x: hand.x, y: hand.y - 6 }
    const toHer = stage(spirit, ...SPIRIT.toHer)
    const land = stage(spirit, ...SPIRIT.land)
    const loop = stage(spirit, ...SPIRIT.loop)
    const bob = Math.sin(spirit * 60) * 1
    let at = beside
    let behind = false
    if (spirit >= SPIRIT.toHer[0] && spirit < SPIRIT.land[0]) {
      at = {
        x: beside.x + (before.x - beside.x) * toHer,
        y: beside.y + (before.y - beside.y) * toHer + bob,
      }
    } else if (spirit >= SPIRIT.land[0] && spirit < SPIRIT.loop[0]) {
      const settle = Math.min(1, land * 4)
      at = {
        x: before.x + (palm.x - before.x) * settle,
        y: before.y + (palm.y - before.y) * settle + bob * 0.5,
      }
    } else if (spirit >= SPIRIT.loop[0] && spirit < SPIRIT.wave[0]) {
      const angle = Math.PI / 2 - loop * Math.PI * 2
      const ring = { x: head.x + 20 * Math.cos(angle), y: head.y + 4 + 6 * Math.sin(angle) }
      // Eases off her palm into the loop, and out of it to beside her.
      const into = Math.min(1, loop / 0.15)
      const outOf = Math.max(0, (loop - 0.85) / 0.15)
      const from = into < 1 ? palm : ring
      const to = outOf > 0 ? beside : ring
      const mix = into < 1 ? into : outOf
      at = { x: from.x + (to.x - from.x) * mix, y: from.y + (to.y - from.y) * mix }
      behind = Math.sin(angle) < 0 && into >= 1 && outOf === 0
    } else if (spirit >= SPIRIT.wave[0]) {
      const rise = stage(spirit, ...SPIRIT.gone)
      at = { x: beside.x + Math.sin(spirit * 90) * 1.5, y: beside.y - rise * 8 + bob }
    }
    const appear = stage(spirit, ...SPIRIT.appear)
    const gone = stage(spirit, ...SPIRIT.gone)
    if (appear >= 0.5 && gone < 0.5) {
      const rows = SPIRIT_FLAP[Math.floor(spirit * 70) % 2]!
      rows.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.') return
          set({ x: at.x - 6 + dx, y: at.y - 5 + dy }, letter, behind ? '.' : undefined)
        }),
      )
    }
    if (appear > 0 && appear < 1) {
      if (appear < 0.55) canvas.stamp(SPARKLE, beside.x - 2, beside.y - 2)
      else canvas.stamp(TWINKLE, beside.x - 1, beside.y - 1)
    }
    if (gone > 0 && gone < 1) {
      if (gone < 0.55) canvas.stamp(SPARKLE, at.x - 2, at.y - 2)
      else canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
    }
  }
}

/**
 * The owl's visit (Pose.owl): flying in, perched on her hand, its blinks, looking at her, its hoot,
 * and flying off (shares of the habit).
 */
export const OWL = {
  arrive: [0.06, 0.28],
  perch: [0.28, 0.74],
  blinks: [0.38, 0.56],
  look: [0.44, 0.52],
  hoot: [0.6, 0.72],
  leave: [0.74, 0.96],
} as const

/**
 * A little owl, perched: ear tufts, a pale face with gold eyes, a gold beak, a speckled breast and
 * gold talons, in the boots' browns. Its eyes' row is swapped for OWL_EYES.
 */
export const OWL_PERCHED = [
  'B.......B',
  'BbbbbbbbB',
  'bJJJbJJJb',
  'JYeJbJeYJ',
  'bJJJkJJJb',
  '.bbbkbbb.',
  'BbyyyyybB',
  'BbyJyJybB',
  '.Bbyyybb.',
  '..k...k..',
]

/** The owl's eyes (OWL_PERCHED's fourth row): ahead, shut, and looking across at her. */
export const OWL_EYES = { ahead: 'JYeJbJeYJ', shut: 'JeeJbJeeJ', across: 'JeYJbJeYJ' } as const

/** Its wings beating as it flies, up and down: pixels out from its left side (mirrored for its right). */
const OWL_WINGS = [
  [
    [-1, 4],
    [-2, 3],
    [-3, 2],
    [-4, 1],
    [-3, 3],
    [-2, 4],
  ],
  [
    [-1, 5],
    [-2, 6],
    [-3, 7],
    [-4, 8],
    [-3, 6],
    [-2, 7],
  ],
] as const

/** Its hoot: a little note, floating up. */
const NOTE = ['.ff', '.f.', 'ff.']

/**
 * A little owl: it flies in from high to one side and lands on her near hand (its talons on her
 * fingers), blinks, turns its eyes to her, hoots (a note floating up), and flies off over her head
 * and away, its wings beating as it flies.
 */
export function paintOwl({ pose, canvas, set, hand, hips }: Scene): void {
  const t = pose.owl ?? 0
  if (t < OWL.arrive[0] || t >= 1) return
  // Where it perches: on her hand, held out to her side. Its flights in and off are measured from
  // that spot as it is with her arm out (her hand goes up to wave as it leaves).
  const spot = { x: hips.x + 22, y: hips.y - 6 }
  const perch = t >= OWL.arrive[1] && t < OWL.leave[0] ? { x: hand.x, y: hand.y - 1 } : spot
  const from = { x: spot.x + 40, y: spot.y - 50 }
  const to = { x: spot.x - 70, y: spot.y - 70 }
  const arrive = stage(t, ...OWL.arrive)
  const leave = stage(t, ...OWL.leave)
  let at = perch
  let flying = false
  if (t < OWL.arrive[1]) {
    // Gliding in, slowing as it lands, in a shallow dip.
    const e = 1 - (1 - arrive) * (1 - arrive)
    at = {
      x: from.x + (spot.x - from.x) * e,
      y: from.y + (spot.y - from.y) * e + Math.sin(e * Math.PI) * 6,
    }
    flying = true
  } else if (t >= OWL.leave[0]) {
    // Off: climbing steeply first, so it passes above her hat, then away to the far side.
    at = {
      x: spot.x + (to.x - spot.x) * leave * leave,
      y: spot.y + (to.y - spot.y) * Math.sqrt(leave),
    }
    flying = true
  }
  const blink = OWL.blinks.some((b) => Math.abs(t - b) < 0.012)
  const looking = t >= OWL.look[0] && t < OWL.look[1]
  const eyes = blink ? OWL_EYES.shut : looking && !flying ? OWL_EYES.across : OWL_EYES.ahead
  const x0 = Math.round(at.x) - 4
  const y0 = Math.round(at.y) - 9
  canvas.stamp(
    OWL_PERCHED.map((row, r) => (r === 3 ? eyes : row)),
    x0,
    y0,
  )
  if (flying) {
    for (const [dx, dy] of OWL_WINGS[Math.floor(t * 60) % 2]!) {
      set({ x: x0 + dx, y: y0 + dy }, 'B')
      set({ x: x0 + 8 - dx, y: y0 + dy }, 'B')
    }
  }
  const hoot = stage(t, ...OWL.hoot)
  if (hoot > 0 && hoot < 1) canvas.stamp(NOTE, x0 + 9 + hoot * 3, y0 - 2 - hoot * 8)
}
