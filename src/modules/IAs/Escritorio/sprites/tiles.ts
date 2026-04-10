import type { Theme, ThemeName } from '../types'
import { TILE, PIXEL, GRID_W, GRID_H } from '../constants'

const P = PIXEL

// ─── Floor tile ───────────────────────────────────────────────────────────────
export function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  theme: ThemeName, t: Theme,
  tx: number, ty: number,
  col: number, row: number,
  scale: number
) {
  const s = scale, sz = TILE * s, p = P * s
  const alt = (col + row) % 2 === 0

  if (theme === 'retro') {
    // Warm wood planks
    ctx.fillStyle = alt ? t.floor1 : t.floor2
    ctx.fillRect(tx, ty, sz, sz)
    // Horizontal plank grain (every 4 art-pixels = 16px tile)
    ctx.fillStyle = t.floorGrain
    ctx.fillRect(tx, ty + sz - p * 0.5, sz, p * 0.5)
    // Subtle vertical seam highlight
    ctx.fillStyle = 'rgba(255,220,150,0.08)'
    ctx.fillRect(tx + p, ty + p, sz - p * 2, p)

  } else if (theme === 'moderno') {
    // Clean light tiles
    ctx.fillStyle = alt ? t.floor1 : t.floor2
    ctx.fillRect(tx, ty, sz, sz)
    // Thin grout lines
    ctx.fillStyle = t.floorGrain
    ctx.fillRect(tx + sz - 1, ty, 1, sz)
    ctx.fillRect(tx, ty + sz - 1, sz, 1)
    // Subtle gloss
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(tx + 2, ty + 2, sz / 3, 2)

  } else {
    // Profissional: marble / stone
    ctx.fillStyle = alt ? t.floor1 : t.floor2
    ctx.fillRect(tx, ty, sz, sz)
    // Marble vein (diagonal line every 6 tiles)
    if ((col * 3 + row * 7) % 11 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      ctx.fillRect(tx + sz * 0.3, ty, 1, sz)
    }
    ctx.fillStyle = t.floorGrain
    ctx.fillRect(tx + sz - 1, ty, 1, sz)
    ctx.fillRect(tx, ty + sz - 1, sz, 1)
  }
}

// ─── Wall tiles ───────────────────────────────────────────────────────────────
export function drawWalls(
  ctx: CanvasRenderingContext2D,
  theme: ThemeName, t: Theme,
  ox: number, oy: number,
  gridW: number, gridH: number,
  scale: number
) {
  const s = scale, sz = TILE * s, p = P * s
  const W = gridW * sz, H = gridH * sz

  // ── Top wall ────────────────────────────────────────────────────────────────
  ctx.fillStyle = t.wallTop
  ctx.fillRect(ox, oy, W, sz)        // top face
  ctx.fillStyle = t.wall
  ctx.fillRect(ox, oy + sz * 0.55, W, sz * 0.45)  // front face (darker)
  ctx.fillStyle = t.wallShadow
  ctx.fillRect(ox, oy + sz - p, W, p)  // shadow at base of top wall

  // Brick pattern (retro & profissional)
  if (theme !== 'moderno') {
    ctx.fillStyle = 'rgba(0,0,0,0.20)'
    const brickH = p * 2, brickW = p * 6
    for (let bx = 0; bx < W; bx += brickW) {
      ctx.fillRect(ox + bx, oy + p, 1, brickH)
    }
    for (let bx = brickW / 2; bx < W; bx += brickW) {
      ctx.fillRect(ox + bx, oy + p * 3, 1, brickH)
    }
  } else {
    // Moderno: accent stripe on top wall
    ctx.fillStyle = '#4a9eff'
    ctx.fillRect(ox, oy, W, p * 0.75)
  }

  // ── Bottom wall ─────────────────────────────────────────────────────────────
  ctx.fillStyle = t.wall
  ctx.fillRect(ox, oy + H - sz, W, sz)
  ctx.fillStyle = t.wallTop
  ctx.fillRect(ox, oy + H - sz, W, p * 1.5)
  ctx.fillStyle = t.wallShadow
  ctx.fillRect(ox, oy + H - sz + p * 1.5, W, p * 0.5)

  // ── Side walls ───────────────────────────────────────────────────────────────
  ctx.fillStyle = t.wall
  ctx.fillRect(ox, oy, sz, H)                  // left
  ctx.fillRect(ox + W - sz, oy, sz, H)         // right
  ctx.fillStyle = t.wallTop
  ctx.fillRect(ox, oy, p * 1.5, H)             // left highlight
  ctx.fillRect(ox + W - p * 1.5, oy, p * 1.5, H) // right highlight
  ctx.fillStyle = t.wallShadow
  ctx.fillRect(ox + sz - p * 0.5, oy, p * 0.5, H)       // left inner shadow
  ctx.fillRect(ox + W - sz, oy, p * 0.5, H)   // right inner shadow

  // ── Outer border (pixel-art outline) ────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(ox, oy, W, 2)
  ctx.fillRect(ox, oy + H - 2, W, 2)
  ctx.fillRect(ox, oy, 2, H)
  ctx.fillRect(ox + W - 2, oy, 2, H)
}

// ─── Canvas background (outside room) ────────────────────────────────────────
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  t: Theme, bgLight: boolean,
  canvasW: number, canvasH: number
) {
  const bg = bgLight ? '#d8d0c4' : t.bg
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvasW, canvasH)
}
