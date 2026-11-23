// Her visitors (HABITS, kind 'visitor'): habits where something comes to see her.

import { FIDGET_MS } from '@shared/character'
import { type Arm, type Face } from '../rig'
import { OWL, SPIRIT } from '../props/visitors'
import {
  type Key,
  lerp,
  ARM_DOWN,
  between,
  OUT_SIDE,
  through,
  toward,
  blinking,
  type Moves,
  once,
} from './kit'

/**
 * A little spirit visiting, from the front: it appears beside her and she looks round, surprised,
 * then smiles; she holds her hand out and it lands on her palm (hearts), her head tilting to it;
 * it loops round her head and she follows it; it hovers beside her and they wave to each other;
 * and it fades away.
 */
export function spirit(): Key[] {
  return through(FIDGET_MS.spirit, (t) => {
    const holding =
      between(t, SPIRIT.toHer[1] - 0.04, SPIRIT.land[0]) *
      (1 - between(t, SPIRIT.land[1], SPIRIT.loop[0] + 0.04))
    const waving =
      between(t, SPIRIT.wave[0] - 0.03, SPIRIT.wave[0]) *
      (1 - between(t, SPIRIT.wave[1], SPIRIT.gone[0] + 0.02))
    const swing = Math.sin(t * 90) * waving
    const hold = toward(OUT_SIDE, holding)
    const arm: Arm =
      waving > 0
        ? {
            shoulder: lerp(hold.shoulder, 2.5 + 0.15 * swing, waving),
            elbow: lerp(hold.elbow, 0.3 + 0.35 * swing, waving),
          }
        : hold
    const landed = t >= SPIRIT.land[0] + 0.06 && t < SPIRIT.land[1]
    const hearts = t >= 0.4 && t < 0.56 ? (t - 0.4) / 0.16 : 0
    const face: Face =
      t < SPIRIT.appear[1]
        ? 'neutral'
        : t < SPIRIT.toHer[0] + 0.06
          ? 'surprised'
          : blinking(t, 0.66, 'happy')
    return {
      view: 'front',
      spirit: t,
      face,
      tilt: landed ? 0.07 : 0,
      hearts,
      arms: [arm, ARM_DOWN],
    }
  })
}

/**
 * A little owl visiting, from the front: it flies in and she holds her arm out for it, surprised
 * and then delighted; it lands on her hand (her arm dipping with its weight), blinks, turns to look
 * at her and hoots, and she smiles back, her head tilting to it; it flies off over her head, and she
 * waves it goodbye.
 */
export function owl(): Key[] {
  return through(FIDGET_MS.owl, (t) => {
    const out =
      between(t, OWL.arrive[0], OWL.arrive[1] - 0.06) *
      (1 - between(t, OWL.leave[0] + 0.04, OWL.leave[0] + 0.1))
    const landing = t >= OWL.perch[0] && t < OWL.perch[0] + 0.05
    const dip = landing ? Math.sin(((t - OWL.perch[0]) / 0.05) * Math.PI) * 0.12 : 0
    const perched = toward({ shoulder: OUT_SIDE.shoulder - dip, elbow: OUT_SIDE.elbow }, out)
    const waving =
      between(t, OWL.leave[0] + 0.08, OWL.leave[0] + 0.12) * (1 - between(t, 0.93, 0.98))
    const swing = Math.sin(t * 80) * waving
    const arm: Arm =
      waving > 0
        ? {
            shoulder: lerp(perched.shoulder, 2.5 + 0.15 * swing, waving),
            elbow: lerp(perched.elbow, 0.3 + 0.35 * swing, waving),
          }
        : perched
    const watching = t >= OWL.perch[0] && t < OWL.leave[0]
    const face: Face =
      t < OWL.arrive[0] + 0.04
        ? 'neutral'
        : t < OWL.perch[0]
          ? 'surprised'
          : blinking(t, watching ? 0.5 : 0.9, 'happy')
    const look =
      t < OWL.perch[0] ? 0.6 : watching ? 0.5 : -0.4 * between(t, OWL.leave[0], OWL.leave[1])
    return { view: 'front', owl: t, face, look, tilt: watching ? 0.07 : 0, arms: [arm, ARM_DOWN] }
  })
}

/** Her visitors, by pose (each plays once, for its HABITS `ms`). */
export const VISITOR_MOVES = {
  spirit: once(spirit),
  owl: once(owl),
} satisfies Moves
