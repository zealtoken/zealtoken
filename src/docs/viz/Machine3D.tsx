import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Frame } from './Frame'
import { css } from './rpc'

/**
 * The machine, as a scene: two loops drawn as stations on a floor plate, with
 * value flowing along glowing paths. Loop 01 runs $ZEAL trades → Foundry →
 * reserve → zZEC. Loop 02 runs zZEC trades → hook → Furnace → burn. Drag to
 * orbit; it rotates on its own otherwise.
 */
type Station = { id: string; label: string; sub: string; pos: [number, number, number]; kind: 'box' | 'vault' | 'coin' | 'pool' | 'furnace' | 'burn' }
const STATIONS: Station[] = [
  { id: 'zeal', label: '$ZEAL trades', sub: 'Pons pool · 1% fee', pos: [-4.2, 0, 1.6], kind: 'box' },
  { id: 'foundry', label: 'Foundry', sub: '60 / 25 / 15 · no owner', pos: [-2.1, 0, -0.6], kind: 'box' },
  { id: 'reserve', label: 'ZEC reserve', sub: 't1Ujk… · attested 6h', pos: [0.2, 0, 1.8], kind: 'vault' },
  { id: 'zzec', label: 'zZEC', sub: 'minted ≤ reserve', pos: [2.2, 0, -0.4], kind: 'coin' },
  { id: 'pool', label: 'zZEC market', sub: 'Uniswap v4 · hook 0.7%', pos: [4.3, 0, 1.4], kind: 'pool' },
  { id: 'furnace', label: 'Furnace', sub: 'one door: burn', pos: [3.6, 0, -2.6], kind: 'furnace' },
  { id: 'burn', label: '0x…dEaD', sub: '$ZEAL burned', pos: [1.0, 0, -3.2], kind: 'burn' },
]
const LOOP1 = ['zeal', 'foundry', 'reserve', 'zzec']
const LOOP2 = ['pool', 'furnace', 'burn']

export function Machine3D() {
  const host = useRef<HTMLDivElement>(null)
  const [labels, setLabels] = useState<{ id: string; x: number; y: number; z: number }[]>([])
  useEffect(() => {
    const el = host.current!; const W = el.clientWidth, H = el.clientHeight
    const green = new THREE.Color(css('--green-bright', '#00c805')), paper = new THREE.Color(css('--bg', '#f7f7f4'))
    const dark = paper.getHSL({ h: 0, s: 0, l: 0 }).l < 0.5
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H); el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 100); let theta = 0.55, phi = 0.95, R = 12.5
    const light = new THREE.DirectionalLight(0xffffff, dark ? 1.3 : 1.7); light.position.set(5, 8, 4); scene.add(light); scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.55 : 0.75))
    const gl = new THREE.PointLight(green, 6, 8); gl.position.set(3.6, 1.4, -2.6); scene.add(gl)
    // floor plate + grid
    const plate = new THREE.Mesh(new THREE.BoxGeometry(12, 0.18, 9), new THREE.MeshStandardMaterial({ color: dark ? 0x14171a : 0xe9e9e2, roughness: 0.95 })); plate.position.y = -0.4; scene.add(plate)
    const grid = new THREE.GridHelper(12, 24, dark ? 0x2a2f33 : 0xcfcfc6, dark ? 0x1e2226 : 0xdcdcd3); grid.position.y = -0.3; scene.add(grid)
    const mat = (c: THREE.ColorRepresentation, emissive = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.15, emissive: emissive ? green : 0x000000, emissiveIntensity: emissive })
    const byId: Record<string, THREE.Vector3> = {}
    for (const s of STATIONS) {
      const p = new THREE.Vector3(...s.pos); byId[s.id] = p
      let m: THREE.Mesh
      if (s.kind === 'box') m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.0), mat(dark ? 0x3a4046 : 0xffffff))
      else if (s.kind === 'vault') m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 32), mat(0xf4b728))
      else if (s.kind === 'coin') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 48), mat(green, 0.35)); m.rotation.x = Math.PI / 2; m.position.y = 0.45 }
      else if (s.kind === 'pool') { m = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.2, 18, 48), mat(dark ? 0x9aa3ab : 0x5b6570)); m.rotation.x = Math.PI / 2 }
      else if (s.kind === 'furnace') m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 1.0), mat(0x1b1f22, 0.9))
      else m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 32), mat(0x000000, 0.15))
      m.position.add(p); if (s.kind !== 'coin') m.position.y += (m.geometry as THREE.BufferGeometry).boundingBox ? 0 : 0.2; scene.add(m)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.98, 48), new THREE.MeshBasicMaterial({ color: green, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, -0.29, p.z); scene.add(ring)
    }
    // paths
    const curveFor = (ids: string[], closed: boolean) => new THREE.CatmullRomCurve3(ids.map((i) => byId[i].clone().setY(0.25)), closed, 'catmullrom', 0.6)
    const c1 = curveFor(LOOP1, false), c2 = curveFor(LOOP2, false)
    for (const c of [c1, c2]) { const g = new THREE.TubeGeometry(c, 120, 0.035, 8, false); scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: green, transparent: true, opacity: 0.5 }))) }
    // particles
    const N = 40, pts = new Float32Array(N * 3), pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const particles = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: green, size: 0.16, transparent: true, opacity: 0.95 })); scene.add(particles)
    const phase = Array.from({ length: N }, (_, i) => i / N)
    let drag = false, lx = 0, ly = 0, raf = 0
    const down = (e: PointerEvent) => { drag = true; lx = e.clientX; ly = e.clientY }
    const move = (e: PointerEvent) => { if (!drag) return; theta -= (e.clientX - lx) * 0.006; phi = Math.min(1.35, Math.max(0.35, phi + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY }
    const up = () => { drag = false }
    renderer.domElement.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const tmp = new THREE.Vector3()
    const frame = (t: number) => {
      if (!drag && !reduce) theta += 0.0022
      cam.position.set(R * Math.sin(phi) * Math.sin(theta), R * Math.cos(phi), R * Math.sin(phi) * Math.cos(theta)); cam.lookAt(0.3, 0, -0.3)
      const k = (t / 9000) % 1
      for (let i = 0; i < N; i++) { const half = i < N / 2; const u = ((half ? phase[i] * 2 : (phase[i] - 0.5) * 2) + k) % 1; (half ? c1 : c2).getPointAt(u, tmp); pts[i * 3] = tmp.x; pts[i * 3 + 1] = tmp.y + 0.05 * Math.sin(t / 300 + i); pts[i * 3 + 2] = tmp.z }
      pgeo.attributes.position.needsUpdate = true
      gl.intensity = 5 + Math.sin(t / 250) * 1.5
      renderer.render(scene, cam)
      setLabels(STATIONS.map((s) => { tmp.set(s.pos[0], 1.15, s.pos[2]).project(cam); return { id: s.id, x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, z: tmp.z } }))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); renderer.domElement.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); renderer.dispose(); el.removeChild(renderer.domElement) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <Frame title="The machine" note="drag to orbit · green particles are value moving · loop 01 left to right, loop 02 back to the burn" tall>
      <div className="m3d" ref={host}>
        {labels.map((l) => { const s = STATIONS.find((x) => x.id === l.id)!; return <div key={l.id} className="m3d-l" style={{ left: l.x, top: l.y, opacity: l.z < 1 ? 1 : 0 }}><b>{s.label}</b><span className="mono">{s.sub}</span></div> })}
      </div>
    </Frame>
  )
}
