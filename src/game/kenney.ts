import * as THREE from 'three'
import rockUrl from '../../kenney_retro-textures-fantasy/PNG/wall_rock.png'
import stoneUrl from '../../kenney_retro-textures-fantasy/PNG/wall_stone.png'
import thatchUrl from '../../kenney_retro-textures-fantasy/PNG/roof_thatch_center.png'
import waterUrl from '../../kenney_retro-textures-fantasy/PNG/floor_ground_water.png'
import skyUrl from '../../kenney_skyboxes/Skyboxes/skybox-morning.png'

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()

function repeating(url: string, repeat: number): THREE.Texture {
  const key = `${url}:${repeat}`
  const hit = cache.get(key)
  if (hit) return hit
  const t = loader.load(url)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  cache.set(key, t)
  return t
}

export function kenneyRock(): THREE.Texture {
  return repeating(rockUrl, 2)
}

export function kenneyStone(): THREE.Texture {
  return repeating(stoneUrl, 1.6)
}

export function kenneyThatch(): THREE.Texture {
  return repeating(thatchUrl, 1.8)
}

export function kenneyWater(): THREE.Texture {
  return repeating(waterUrl, 1.2)
}

export function applyKenneySky(scene: THREE.Scene, fog = 0xc5c2bc): void {
  loader.load(skyUrl, (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    scene.background = t
    scene.fog = new THREE.Fog(fog, 40, 94)
  })
}
