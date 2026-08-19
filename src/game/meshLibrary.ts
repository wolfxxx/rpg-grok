import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { publicUrl } from '../publicUrl'
import type { ActorKind } from './characters3d'

export const ACTOR_GLB: Partial<Record<ActorKind, string>> = {
  warden: publicUrl('/models/kael.glb'),
  mystic: publicUrl('/models/seris.glb'),
  scout: publicUrl('/models/nyra.glb'),
  golem: publicUrl('/models/golem.glb'),
  beetle: publicUrl('/models/beetle.glb'),
  wraith: publicUrl('/models/wraith.glb'),
  goblin: publicUrl('/models/goblin.glb'),
  crab: publicUrl('/models/crab.glb'),
  devil: publicUrl('/models/devil.glb'),
}

const JOINT_ALIASES: Record<string, JointKey> = {
  Hip: 'hip',
  GHip: 'hip',
  SHip: 'hip',
  NHip: 'hip',
  BHip: 'hip',
  WHip: 'hip',
  Torso: 'torso',
  GTorso: 'torso',
  STorso: 'torso',
  NTorso: 'torso',
  Head: 'head',
  GHead: 'head',
  SHead: 'head',
  NHead: 'head',
  BHead: 'head',
  WHead: 'head',
  LegL: 'legL',
  GLegL: 'legL',
  SLegL: 'legL',
  NLegL: 'legL',
  LegR: 'legR',
  GLegR: 'legR',
  SLegR: 'legR',
  NLegR: 'legR',
  ShinL: 'shinL',
  GShinL: 'shinL',
  SShinL: 'shinL',
  NShinL: 'shinL',
  ShinR: 'shinR',
  GShinR: 'shinR',
  SShinR: 'shinR',
  NShinR: 'shinR',
  ArmL: 'armL',
  GArmL: 'armL',
  SArmL: 'armL',
  NArmL: 'armL',
  WArmL: 'armL',
  ArmR: 'armR',
  GArmR: 'armR',
  SArmR: 'armR',
  NArmR: 'armR',
  WArmR: 'armR',
  ForeL: 'forearmL',
  GForeL: 'forearmL',
  SForeL: 'forearmL',
  NForeL: 'forearmL',
  ForeR: 'forearmR',
  GForeR: 'forearmR',
  SForeR: 'forearmR',
  NForeR: 'forearmR',
  Weapon: 'weapon',
  GWeapon: 'weapon',
  SWeapon: 'weapon',
  NWeapon: 'weapon',
}

export type JointKey =
  | 'hip'
  | 'torso'
  | 'head'
  | 'legL'
  | 'legR'
  | 'shinL'
  | 'shinR'
  | 'armL'
  | 'armR'
  | 'forearmL'
  | 'forearmR'
  | 'weapon'

export type JointMap = Partial<Record<JointKey, THREE.Object3D>>

const loader = new GLTFLoader()
const cache = new Map<string, Promise<THREE.Group>>()

export function loadActorMesh(kind: ActorKind): Promise<THREE.Group> | null {
  const url = ACTOR_GLB[kind]
  if (!url) return null
  let pending = cache.get(url)
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => gltf.scene)
    cache.set(url, pending)
  }
  return pending.then((scene) => scene.clone(true))
}

export function findJoints(root: THREE.Object3D): JointMap {
  const found: JointMap = {}
  root.traverse((obj) => {
    const key = JOINT_ALIASES[obj.name]
    if (key && !found[key]) found[key] = obj
  })
  return found
}
