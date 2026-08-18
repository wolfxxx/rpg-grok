import chop from '../../kenney_rpg-audio/Audio/chop.ogg'
import cloth1 from '../../kenney_rpg-audio/Audio/cloth1.ogg'
import clothBelt from '../../kenney_rpg-audio/Audio/clothBelt.ogg'
import creak2 from '../../kenney_rpg-audio/Audio/creak2.ogg'
import drawKnife1 from '../../kenney_rpg-audio/Audio/drawKnife1.ogg'
import drawKnife2 from '../../kenney_rpg-audio/Audio/drawKnife2.ogg'
import drawKnife3 from '../../kenney_rpg-audio/Audio/drawKnife3.ogg'
import handleCoins from '../../kenney_rpg-audio/Audio/handleCoins.ogg'
import handleCoins2 from '../../kenney_rpg-audio/Audio/handleCoins2.ogg'
import knifeSlice from '../../kenney_rpg-audio/Audio/knifeSlice.ogg'
import knifeSlice2 from '../../kenney_rpg-audio/Audio/knifeSlice2.ogg'
import metalClick from '../../kenney_rpg-audio/Audio/metalClick.ogg'
import footGrass0 from '../../kenney_impact-sounds/Audio/footstep_grass_000.ogg'
import footGrass1 from '../../kenney_impact-sounds/Audio/footstep_grass_001.ogg'
import footGrass2 from '../../kenney_impact-sounds/Audio/footstep_grass_002.ogg'
import footGrass3 from '../../kenney_impact-sounds/Audio/footstep_grass_003.ogg'
import footGrass4 from '../../kenney_impact-sounds/Audio/footstep_grass_004.ogg'
import mining0 from '../../kenney_impact-sounds/Audio/impactMining_000.ogg'
import mining1 from '../../kenney_impact-sounds/Audio/impactMining_001.ogg'
import woodH0 from '../../kenney_impact-sounds/Audio/impactWood_heavy_000.ogg'
import woodH1 from '../../kenney_impact-sounds/Audio/impactWood_heavy_001.ogg'
import punch0 from '../../kenney_impact-sounds/Audio/impactPunch_heavy_000.ogg'
import punch1 from '../../kenney_impact-sounds/Audio/impactPunch_heavy_001.ogg'
import plate0 from '../../kenney_impact-sounds/Audio/impactPlate_heavy_000.ogg'
import plate1 from '../../kenney_impact-sounds/Audio/impactPlate_heavy_001.ogg'
import soft0 from '../../kenney_impact-sounds/Audio/impactSoft_medium_000.ogg'
import soft1 from '../../kenney_impact-sounds/Audio/impactSoft_medium_001.ogg'
import type { Sfx } from './audio'

/** Kenney clips that fit the action. Heal stays on the baked magical chord. */
export const kenneySfx: Partial<Record<Sfx, string[]>> = {
  swing: [drawKnife1, drawKnife2, drawKnife3],
  hit: [knifeSlice, knifeSlice2, chop],
  hurt: [soft0, soft1],
  die: [punch0, punch1],
  crystal: [handleCoins],
  dodge: [clothBelt, cloth1],
  foot: [footGrass0, footGrass1, footGrass2, footGrass3, footGrass4],
  ui: [metalClick],
  boss: [plate0, plate1],
  slam: [mining0, mining1, woodH0, woodH1],
  win: [handleCoins2],
  lose: [creak2],
}
