import type { Theme, FurnitureType } from '../types'
import { TILE, PIXEL } from '../constants'

// Helper: draw a pixel-art rectangle with highlight/shadow edges
function pxRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, hl: string, sh: string
) {
  ctx.fillStyle = fill;   ctx.fillRect(x, y, w, h)
  ctx.fillStyle = hl;     ctx.fillRect(x, y, w, PIXEL); ctx.fillRect(x, y, PIXEL, h)
  ctx.fillStyle = sh;     ctx.fillRect(x + w - PIXEL, y, PIXEL, h); ctx.fillRect(x, y + h - PIXEL, w, PIXEL)
}

// ─── Desk (2×1 tiles) ────────────────────────────────────────────────────────
export function drawDesk(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale, w = sz * 2
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + p, y + p, w, sz)
  // Surface
  pxRect(ctx, x, y, w, sz, t.desk, t.deskHL, t.deskShadow)
  // Drawer line
  ctx.fillStyle = t.deskShadow; ctx.fillRect(x + w * 0.6, y + p * 2, w * 0.35, p * 0.5)
  // Drawer handle
  ctx.fillStyle = t.deskHL; ctx.fillRect(x + w * 0.75, y + p * 3.5, p * 2, p)
}

// ─── Chair (1×1 tile) ────────────────────────────────────────────────────────
export function drawChair(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale
  // Seat
  ctx.fillStyle = t.chair; ctx.fillRect(x + p, y + sz * 0.45, sz - p * 2, sz * 0.45)
  ctx.fillStyle = t.chairHL; ctx.fillRect(x + p, y + sz * 0.45, sz - p * 2, p)
  // Back rest
  ctx.fillStyle = t.chair; ctx.fillRect(x + p, y + sz * 0.1, sz - p * 2, sz * 0.35)
  ctx.fillStyle = t.chairHL; ctx.fillRect(x + p, y + sz * 0.1, sz - p * 2, p)
  // Legs
  ctx.fillStyle = t.deskShadow
  ctx.fillRect(x + p, y + sz * 0.88, p * 1.5, sz * 0.12)
  ctx.fillRect(x + sz - p * 2.5, y + sz * 0.88, p * 1.5, sz * 0.12)
}

// ─── Monitor (1×1 tile) ──────────────────────────────────────────────────────
export function drawMonitor(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number, isOnline = false) {
  const sz = TILE * scale, p = PIXEL * scale
  const mx = x + sz * 0.15, my = y + p, mw = sz * 0.7, mh = sz * 0.6
  // Frame
  ctx.fillStyle = t.deskShadow; ctx.fillRect(mx, my, mw, mh)
  // Screen
  ctx.fillStyle = isOnline ? t.screenOn : t.screen; ctx.fillRect(mx + p, my + p, mw - p * 2, mh - p * 2)
  // Glow overlay when online
  if (isOnline) { ctx.fillStyle = t.screenGlow; ctx.fillRect(mx + p, my + p, mw - p * 2, mh - p * 2) }
  // Scanline (top highlight)
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(mx + p, my + p, mw - p * 2, p)
  // Stand
  ctx.fillStyle = t.deskShadow
  ctx.fillRect(x + sz * 0.45, my + mh, p, p * 2); ctx.fillRect(x + sz * 0.35, my + mh + p, p * 5, p)
}

// ─── Plant (1×1 tile) ────────────────────────────────────────────────────────
export function drawPlant(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number, tick = 0) {
  const sz = TILE * scale, p = PIXEL * scale
  const leafY = y + sz * 0.1 + Math.sin(tick * 0.02) * p * 0.5
  // Pot
  ctx.fillStyle = t.plantPot
  ctx.fillRect(x + sz * 0.3, y + sz * 0.65, sz * 0.4, sz * 0.3)
  ctx.fillStyle = t.deskShadow; ctx.fillRect(x + sz * 0.3, y + sz * 0.65, sz * 0.4, p)
  // Soil
  ctx.fillStyle = '#2a1a0a'; ctx.fillRect(x + sz * 0.32, y + sz * 0.67, sz * 0.36, p)
  // Leaves (3 circles via fillRect approximation)
  ctx.fillStyle = t.plant
  ctx.fillRect(x + sz * 0.3, leafY + sz * 0.3, sz * 0.4, sz * 0.35)
  ctx.fillRect(x + sz * 0.15, leafY + sz * 0.4, sz * 0.35, sz * 0.25)
  ctx.fillRect(x + sz * 0.5, leafY + sz * 0.4, sz * 0.35, sz * 0.25)
  // Darker centre
  ctx.fillStyle = t.deskShadow + '55'; ctx.fillRect(x + sz * 0.35, leafY + sz * 0.32, sz * 0.3, sz * 0.28)
  // Optional flower
  ctx.fillStyle = '#ff88aa'; ctx.fillRect(x + sz * 0.44, leafY + sz * 0.2, p * 1.5, p * 1.5)
}

// ─── Bookshelf (1×2 tiles) ───────────────────────────────────────────────────
export function drawBookshelf(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale, h = sz * 2
  pxRect(ctx, x, y, sz, h, t.chair, t.chairHL, t.deskShadow)
  const bookColors = ['#c0392b','#2980b9','#27ae60','#f39c12','#8e44ad','#16a085']
  let bx = x + p * 1.5
  const shelves = [0.15, 0.4, 0.65, 0.88]
  shelves.forEach((sy, si) => {
    ctx.fillStyle = t.deskShadow; ctx.fillRect(x + p, y + h * sy - 1, sz - p * 2, 2)
    let cx2 = bx
    while (cx2 < x + sz - p * 2) {
      const bw = (p * (1 + (si + cx2) % 2))
      ctx.fillStyle = bookColors[(si * 3 + Math.round(cx2 / p)) % bookColors.length]
      ctx.fillRect(cx2, y + h * sy + 2, bw, h * 0.22)
      cx2 += bw + 1
    }
  })
}

// ─── Coffee machine (1×1) ────────────────────────────────────────────────────
export function drawCoffee(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale
  ctx.fillStyle = t.chair; ctx.fillRect(x + p * 2, y + p * 2, sz - p * 4, sz - p * 3)
  ctx.fillStyle = t.chairHL; ctx.fillRect(x + p * 2, y + p * 2, sz - p * 4, p)
  ctx.fillStyle = '#c0392b'; ctx.fillRect(x + sz * 0.35, y + p * 3, p * 1.5, p * 1.5)
  ctx.fillStyle = t.screenOn + 'aa'; ctx.fillRect(x + p * 3, y + p * 6, sz - p * 6, p)
  // Cup
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + sz * 0.35, y + sz * 0.65, sz * 0.3, sz * 0.25)
  ctx.fillStyle = '#4a2800'; ctx.fillRect(x + sz * 0.37, y + sz * 0.67, sz * 0.26, sz * 0.15)
}

// ─── Lamp (1×1) ──────────────────────────────────────────────────────────────
export function drawLamp(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number, tick = 0) {
  const sz = TILE * scale, p = PIXEL * scale
  const glow = 0.4 + Math.sin(tick * 0.03) * 0.1
  // Base
  ctx.fillStyle = t.deskShadow; ctx.fillRect(x + sz * 0.35, y + sz * 0.82, sz * 0.3, p * 1.5)
  // Pole
  ctx.fillStyle = t.chairHL; ctx.fillRect(x + sz * 0.47, y + sz * 0.3, p, sz * 0.52)
  // Shade
  ctx.fillStyle = '#f0c060'; ctx.fillRect(x + sz * 0.25, y + sz * 0.1, sz * 0.5, sz * 0.22)
  ctx.fillStyle = `rgba(255,200,50,${glow})`; ctx.fillRect(x + sz * 0.3, y + sz * 0.32, sz * 0.4, sz * 0.2)
}

// ─── Rug (4×3 tiles, walkable) ───────────────────────────────────────────────
export function drawRug(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, w = sz * 4, h = sz * 3
  ctx.fillStyle = t.carpet + 'cc'; ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(x + sz * 0.5, y + sz * 0.5, w - sz, h - sz)
  ctx.fillStyle = t.carpet; ctx.fillRect(x + sz, y + sz, w - sz * 2, h - sz * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y, w, PIXEL * scale); ctx.fillRect(x, y + h - PIXEL * scale, w, PIXEL * scale)
  ctx.fillRect(x, y, PIXEL * scale, h); ctx.fillRect(x + w - PIXEL * scale, y, PIXEL * scale, h)
}

// ─── Trash bin (1×1) ─────────────────────────────────────────────────────────
export function drawTrash(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale
  ctx.fillStyle = t.chairHL; ctx.fillRect(x + sz * 0.3, y + sz * 0.35, sz * 0.4, sz * 0.55)
  ctx.fillStyle = t.chair;   ctx.fillRect(x + sz * 0.28, y + sz * 0.3, sz * 0.44, p)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(x + sz * 0.38, y + sz * 0.4, p, sz * 0.4)
  ctx.fillRect(x + sz * 0.5, y + sz * 0.4, p, sz * 0.4)
}

// ─── Cabinet / filing (1×2) ──────────────────────────────────────────────────
export function drawCabinet(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale, h = sz * 2
  pxRect(ctx, x + p, y, sz - p * 2, h, t.desk, t.deskHL, t.deskShadow)
  ctx.fillStyle = t.deskShadow; ctx.fillRect(x + p, y + h * 0.5, sz - p * 2, 1)
  ctx.fillStyle = t.deskHL
  ctx.fillRect(x + sz * 0.38, y + h * 0.25, p * 1.5, p); ctx.fillRect(x + sz * 0.38, y + h * 0.75, p * 1.5, p)
}

// ─── Printer (1×1) ───────────────────────────────────────────────────────────
export function drawPrinter(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale
  pxRect(ctx, x + p, y + p * 2, sz - p * 2, sz - p * 3, t.chairHL, t.chair, t.deskShadow)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + sz * 0.3, y + sz * 0.3, sz * 0.4, p)
  ctx.fillStyle = t.screenOn; ctx.fillRect(x + sz * 0.35, y + p * 3, p * 2, p)
}

// ─── Wall art (1×1, decorative) ──────────────────────────────────────────────
export function drawWallArt(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale
  ctx.fillStyle = '#fff8f0'; ctx.fillRect(x + p * 2, y + p, sz - p * 4, sz - p * 2)
  ctx.fillStyle = t.deskShadow; ctx.fillRect(x + p * 2, y + p, sz - p * 4, 1); ctx.fillRect(x + p * 2, y + sz - p * 2, sz - p * 4, 1)
  ctx.fillRect(x + p * 2, y + p, 1, sz - p * 3); ctx.fillRect(x + sz - p * 2 - 1, y + p, 1, sz - p * 3)
  ctx.fillStyle = t.plant; ctx.fillRect(x + sz * 0.3, y + sz * 0.3, sz * 0.4, sz * 0.3)
  ctx.fillStyle = t.screenOn + '88'; ctx.fillRect(x + sz * 0.35, y + sz * 0.25, sz * 0.3, sz * 0.15)
}

// ─── Sofa (3×1) ──────────────────────────────────────────────────────────────
export function drawSofa(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale, w = sz * 3
  pxRect(ctx, x, y + sz * 0.35, w, sz * 0.65, t.carpet, t.carpet + 'cc', t.deskShadow)
  ctx.fillStyle = t.carpet + 'dd'; ctx.fillRect(x + p, y + sz * 0.1, w - p * 2, sz * 0.28)
  ctx.fillStyle = t.chairHL; ctx.fillRect(x, y + sz * 0.35, p * 1.5, sz * 0.65)
  ctx.fillRect(x + w - p * 1.5, y + sz * 0.35, p * 1.5, sz * 0.65)
}

// ─── Meeting table (4×2) ─────────────────────────────────────────────────────
export function drawMeetingTable(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, scale: number) {
  const sz = TILE * scale, p = PIXEL * scale, w = sz * 4, h = sz * 2
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + p * 2, y + p * 2, w, h)
  pxRect(ctx, x, y, w, h, t.desk, t.deskHL, t.deskShadow)
  ctx.fillStyle = t.deskShadow + '55'; ctx.fillRect(x + p * 2, y + p * 2, w - p * 4, h - p * 4)
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────
export function drawFurniture(
  ctx: CanvasRenderingContext2D, type: FurnitureType,
  t: Theme, x: number, y: number, scale: number,
  opts: { isOnline?: boolean; tick?: number } = {}
) {
  switch (type) {
    case 'desk':          return drawDesk(ctx, t, x, y, scale)
    case 'chair':         return drawChair(ctx, t, x, y, scale)
    case 'monitor':       return drawMonitor(ctx, t, x, y, scale, opts.isOnline)
    case 'plant':         return drawPlant(ctx, t, x, y, scale, opts.tick)
    case 'bookshelf':     return drawBookshelf(ctx, t, x, y, scale)
    case 'coffee':        return drawCoffee(ctx, t, x, y, scale)
    case 'lamp':          return drawLamp(ctx, t, x, y, scale, opts.tick)
    case 'rug':           return drawRug(ctx, t, x, y, scale)
    case 'trash':         return drawTrash(ctx, t, x, y, scale)
    case 'cabinet':       return drawCabinet(ctx, t, x, y, scale)
    case 'printer':       return drawPrinter(ctx, t, x, y, scale)
    case 'wallArt':       return drawWallArt(ctx, t, x, y, scale)
    case 'sofa':          return drawSofa(ctx, t, x, y, scale)
    case 'meetingTable':  return drawMeetingTable(ctx, t, x, y, scale)
  }
}
