import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Edges, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import {
  CARCASS_T,
  computeBoards,
  computeDims,
  type Board,
  type DrawerConfig,
} from '@/lib/drawer'
import { useSettingsStore } from '@/store/useSettingsStore'

export const DEFAULT_CAMERA_POSITION: [number, number, number] = [4.2, 3, 5.6]

interface BoardMaterial {
  color: string
  roughness: number
  metalness?: number
}

const MATERIALS = {
  box: { color: '#e8d8bb', roughness: 0.6 } satisfies BoardMaterial,
  groove: { color: '#b9a278', roughness: 0.9 } satisfies BoardMaterial,
  rail: { color: '#6f6f6f', roughness: 0.35, metalness: 0.7 } satisfies BoardMaterial,
  face: { color: '#f5eee1', roughness: 0.5 } satisfies BoardMaterial,
}

const EDGE_COLOR = '#3d3328'
const EDGE_COLOR_METAL = '#2a2a2a'

/** A board rendered with visible edges so panel boundaries read clearly. */
function BoardMesh({
  board,
  material,
  edgeColor = EDGE_COLOR,
}: {
  board: Board
  material: BoardMaterial
  edgeColor?: string
}) {
  return (
    <mesh position={board.position}>
      <boxGeometry args={board.size} />
      <meshStandardMaterial {...material} />
      <Edges color={edgeColor} threshold={15} />
    </mesh>
  )
}

function DrawerModel({ config }: { config: DrawerConfig }) {
  const groupRef = useRef<THREE.Group>(null)
  const pullRef = useRef(config.pullOut / 100)

  const dims = useMemo(() => computeDims(config), [config])
  const boards = useMemo(() => computeBoards(config), [config])

  // Smoothly animate the pull-out amount. The box group is offset back by
  // the inset face thickness and slides out by its own box depth.
  useFrame((_, dt) => {
    const group = groupRef.current
    if (!group) return
    const target = config.pullOut / 100
    pullRef.current = THREE.MathUtils.damp(pullRef.current, target, 8, dt)
    group.position.z =
      dims.boxZOffset + pullRef.current * dims.boxDepth
  })

  return (
    <group ref={groupRef}>
      {/* Drawer box boards */}
      <group>
        {boards.box.map((board) => (
          <BoardMesh key={board.id} board={board} material={MATERIALS.box} />
        ))}
      </group>

      {/* Dado grooves where the bottom panel seats */}
      <group>
        {boards.grooves.map((board) => (
          <BoardMesh
            key={board.id}
            board={board}
            material={MATERIALS.groove}
          />
        ))}
      </group>

      {/* Slide rails (hardware) */}
      <group>
        {boards.rails.map((board) => (
          <BoardMesh
            key={board.id}
            board={board}
            material={MATERIALS.rail}
            edgeColor={EDGE_COLOR_METAL}
          />
        ))}
      </group>

      {/* Face attachment */}
      <group>
        {boards.face.map((board) => (
          <BoardMesh key={board.id} board={board} material={MATERIALS.face} />
        ))}
      </group>
    </group>
  )
}

/**
 * Standard 3D-software navigation: left-drag rotates, scroll zooms,
 * holding Shift (or right-drag) pans.
 */
function ShiftPanControls() {
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitControlsImpl | null

  useEffect(() => {
    if (!controls) return
    const apply = (shift: boolean) => {
      controls.mouseButtons = {
        LEFT: shift ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }
    }
    const onKeyDown = (event: KeyboardEvent) => apply(event.shiftKey)
    const onKeyUp = (event: KeyboardEvent) => apply(event.shiftKey)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [controls])

  return null
}

interface Bounds {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

/**
 * Builds a single watertight geometry for a box with a box opening carved
 * inside it (outer box minus inner box, sharing the front plane).
 *
 * A shared vertex grid (4 × 4 × 3: outer/inner x and y bounds, and the
 * back/cavity/front z planes) is used for every face, so all edges are
 * shared exactly between exactly two triangles — no overlaps, no
 * T-junctions, no leftover edge lines. Faces are emitted with outward
 * winding.
 */
function buildHollowBoxGeometry(outer: Bounds, inner: Bounds): THREE.BufferGeometry {
  // Shared vertex grid
  const X = [outer.x0, inner.x0, inner.x1, outer.x1]
  const Y = [outer.y0, inner.y0, inner.y1, outer.y1]
  const Z = [outer.z0, inner.z0, 0]
  const V = (xi: number, yi: number, zi: number) => xi * 12 + yi * 3 + zi

  const vertices: number[] = []
  for (let xi = 0; xi < 4; xi++) {
    for (let yi = 0; yi < 4; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        vertices.push(X[xi], Y[yi], Z[zi])
      }
    }
  }

  // Quads as vertex indices + their outward normal
  const quads: Array<[number, number, number, number]> = []
  const normals: Array<[number, number, number]> = []
  const addQuad = (
    a: number,
    b: number,
    c: number,
    d: number,
    normal: [number, number, number],
  ) => {
    quads.push([a, b, c, d])
    normals.push(normal)
  }

  // Outer faces (top/bottom split by x-cells, left/right by y-cells, back by a 3×3 grid)
  for (let xi = 0; xi < 3; xi++) {
    for (let zi = 0; zi < 2; zi++) {
      addQuad(V(xi, 3, zi), V(xi + 1, 3, zi), V(xi + 1, 3, zi + 1), V(xi, 3, zi + 1), [0, 1, 0])
      addQuad(V(xi, 0, zi), V(xi + 1, 0, zi), V(xi + 1, 0, zi + 1), V(xi, 0, zi + 1), [0, -1, 0])
    }
  }
  for (let yi = 0; yi < 3; yi++) {
    for (let zi = 0; zi < 2; zi++) {
      addQuad(V(0, yi, zi), V(0, yi + 1, zi), V(0, yi + 1, zi + 1), V(0, yi, zi + 1), [-1, 0, 0])
      addQuad(V(3, yi, zi), V(3, yi + 1, zi), V(3, yi + 1, zi + 1), V(3, yi, zi + 1), [1, 0, 0])
    }
  }
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      addQuad(V(xi, yi, 0), V(xi + 1, yi, 0), V(xi + 1, yi + 1, 0), V(xi, yi + 1, 0), [0, 0, -1])
    }
  }

  // Cavity faces (single quads, sharing edges with the rim and each other)
  addQuad(V(1, 2, 1), V(2, 2, 1), V(2, 2, 2), V(1, 2, 2), [0, -1, 0]) // cavity top
  addQuad(V(1, 1, 1), V(2, 1, 1), V(2, 1, 2), V(1, 1, 2), [0, 1, 0]) // cavity bottom
  addQuad(V(1, 1, 1), V(1, 2, 1), V(1, 2, 2), V(1, 1, 2), [1, 0, 0]) // cavity left
  addQuad(V(2, 1, 1), V(2, 2, 1), V(2, 2, 2), V(2, 1, 2), [-1, 0, 0]) // cavity right
  addQuad(V(1, 1, 1), V(2, 1, 1), V(2, 2, 1), V(1, 2, 1), [0, 0, 1]) // cavity back

  // Front rim (z = 0 annulus): 3×3 cells minus the opening cell
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      if (xi === 1 && yi === 1) continue
      addQuad(V(xi, yi, 2), V(xi + 1, yi, 2), V(xi + 1, yi + 1, 2), V(xi, yi + 1, 2), [0, 0, 1])
    }
  }

  // Emit triangles with outward winding
  const index: number[] = []
  for (let q = 0; q < quads.length; q++) {
    const [a, b, c, d] = quads[q]
    const [nx, ny, nz] = normals[q]
    const ax = vertices[3 * a], ay = vertices[3 * a + 1], az = vertices[3 * a + 2]
    const bx = vertices[3 * b], by = vertices[3 * b + 1], bz = vertices[3 * b + 2]
    const cx = vertices[3 * c], cy = vertices[3 * c + 1], cz = vertices[3 * c + 2]
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
    const px = e1y * e2z - e1z * e2y
    const py = e1z * e2x - e1x * e2z
    const pz = e1x * e2y - e1y * e2x
    const dot = px * nx + py * ny + pz * nz
    if (dot >= 0) {
      index.push(a, b, c, a, c, d)
    } else {
      index.push(a, c, b, a, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Simple hollow carcass: a box with a box opening inside, rendered as ONE
 * single mesh (one geometry, one material, one edge set).
 */
function CarcassGhost({
  config,
  opacity,
}: {
  config: DrawerConfig
  opacity: number
}) {
  const t = CARCASS_T
  const { openingW, openingH, openingD } = config
  const alpha = opacity / 100

  const geometry = useMemo(() => {
    const outer: Bounds = {
      x0: -openingW / 2 - t,
      x1: openingW / 2 + t,
      y0: -openingH / 2 - t,
      y1: openingH / 2 + t,
      z0: -openingD - t,
      z1: 0,
    }
    const inner: Bounds = {
      x0: -openingW / 2,
      x1: openingW / 2,
      y0: -openingH / 2,
      y1: openingH / 2,
      z0: -openingD,
      z1: 0,
    }
    return buildHollowBoxGeometry(outer, inner)
  }, [openingW, openingH, openingD, t])

  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#9aa0a6',
        transparent: true,
        opacity: alpha,
        depthWrite: false,
        flatShading: true,
        roughness: 0.5,
      }),
    [alpha],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      edges.dispose()
      material.dispose()
    }
  }, [geometry, edges, material])

  return (
    <group>
      <mesh geometry={geometry} material={material} />
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#64748b" />
      </lineSegments>
    </group>
  )
}

/**
 * Persists the camera orientation (position + target) across refresh and
 * restores it on mount. Reacts to reset requests from the viewport.
 */
function PersistCamera({
  defaultPosition,
  defaultTarget,
}: {
  defaultPosition: [number, number, number]
  defaultTarget: [number, number, number]
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitControlsImpl | null
  const viewport = useSettingsStore((state) => state.viewport)
  const setViewport = useSettingsStore((state) => state.setViewport)
  const resetCount = useSettingsStore((state) => state.viewportResetCount)

  // Restore the saved orientation once on mount
  const restored = useRef(false)
  useEffect(() => {
    if (!controls || restored.current) return
    restored.current = true
    if (viewport?.cameraPosition && viewport?.target) {
      camera.position.set(...viewport.cameraPosition)
      controls.target.set(...viewport.target)
      controls.update()
    }
  }, [camera, controls, viewport])

  // Save the orientation as the user navigates (throttled, plus on release)
  useEffect(() => {
    if (!controls) return
    let lastSave = 0
    const save = () => {
      setViewport({
        cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      })
    }
    const throttled = () => {
      const now = performance.now()
      if (now - lastSave < 250) return
      lastSave = now
      save()
    }
    controls.addEventListener('change', throttled)
    controls.addEventListener('end', save)
    return () => {
      controls.removeEventListener('change', throttled)
      controls.removeEventListener('end', save)
    }
  }, [camera, controls, setViewport])

  // Reset to the default framing when requested
  const prevResetCount = useRef(resetCount)
  useEffect(() => {
    if (resetCount === prevResetCount.current || !controls) return
    prevResetCount.current = resetCount
    camera.position.set(...defaultPosition)
    controls.target.set(...defaultTarget)
    controls.update()
    setViewport(null)
  }, [resetCount, camera, controls, defaultPosition, defaultTarget, setViewport])

  return null
}

export function DrawerScene({
  config,
  carcassOpacity,
}: {
  config: DrawerConfig
  carcassOpacity: number
}) {
  const maxDim = Math.max(config.openingW, config.openingH, config.openingD, 1)
  // Normalize the model so the largest opening dimension ≈ 4.5 world units,
  // keeping the camera framing consistent across sizes.
  const scale = 4.5 / maxDim
  const floorY = -(config.openingH / 2 + CARCASS_T + 50) * scale
  const targetZ = -(config.openingD / 2) * scale

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffffff', '#d9d2c5', 0.5]} />
      <directionalLight position={[6, 9, 6]} intensity={1.4} />
      <directionalLight position={[-6, -2, -4]} intensity={0.35} color="#bcd0ff" />

      <group scale={scale}>
        {/* Simple hollow carcass: box with a box opening, built from panels */}
        {carcassOpacity > 0 && (
          <CarcassGhost config={config} opacity={carcassOpacity} />
        )}

        <DrawerModel config={config} />
      </group>

      <Grid
        position={[0, floorY, 0]}
        args={[10, 10]}
        cellSize={0.25}
        cellThickness={0.6}
        cellColor="#6b7280"
        sectionSize={1.25}
        sectionThickness={1.1}
        sectionColor="#4b5563"
        fadeDistance={30}
        fadeStrength={2}
      />

      <ShiftPanControls />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, -0.15, targetZ]}
        minDistance={0.8}
        maxDistance={16}
      />
      <PersistCamera
        defaultPosition={DEFAULT_CAMERA_POSITION}
        defaultTarget={[0, -0.15, targetZ]}
      />
    </>
  )
}
