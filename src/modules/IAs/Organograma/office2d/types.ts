// ─── Constants ────────────────────────────────────────────────────────────────
export const TILE       = 48
export const WALL_T     = 12
export const CORRIDOR_W = 3 * TILE
export const ROWS       = 14

export const STATUS_COLOR: Record<string, string> = {
  online: '#22c55e', ocupada: '#eab308', aguardando: '#3b82f6',
  offline: '#6b7280', erro: '#ef4444', pausada: '#f97316',
}

// ─── Layout & Theme ───────────────────────────────────────────────────────────
export type LayoutMode = 'moderno' | 'retro' | 'profissional'
export type ThemeName  = 'moderno' | 'retro' | 'scifi' | 'natureza'

export interface Theme {
  f1: string; f2: string; grid: string
  wall: string; wallHL: string
  desk: string; deskHL: string; chair: string
  monitor: string; glow: string
  label: string; emoji: string
}

export const THEMES: Record<ThemeName, Theme> = {
  moderno:  { f1:'#1a1e2a', f2:'#1d2232', grid:'#141822', wall:'#1e3a5f', wallHL:'#2b5080', desk:'#4a3820', deskHL:'#6b5530', chair:'#18183a', monitor:'#111122', glow:'#3a80ff', label:'Moderno',  emoji:'🏢' },
  retro:    { f1:'#3d2d0f', f2:'#352809', grid:'#1a1200', wall:'#1e3a5f', wallHL:'#2b5080', desk:'#7c5c2a', deskHL:'#a07840', chair:'#1a1a3a', monitor:'#111122', glow:'#5078ff', label:'Retrô',    emoji:'🪵' },
  scifi:    { f1:'#050a14', f2:'#080f1e', grid:'#0d1525', wall:'#0a1a30', wallHL:'#1a4070', desk:'#0d2840', deskHL:'#1a5080', chair:'#0a0a25', monitor:'#050510', glow:'#00e5ff', label:'Sci-Fi',   emoji:'🚀' },
  natureza: { f1:'#1a2a15', f2:'#162210', grid:'#0f1a0a', wall:'#163520', wallHL:'#2a5530', desk:'#2d4a20', deskHL:'#4a7030', chair:'#1a2a10', monitor:'#0d1a08', glow:'#22c55e', label:'Natureza', emoji:'🌿' },
}

// ─── Room config ──────────────────────────────────────────────────────────────
export interface SalaConfig {
  id: string
  nome: string
  theme: ThemeName
  cols: number
  desks: Array<{ col: number; row: number }>
}

export const DEFAULT_DESKS_16 = [
  { col:2, row:2 }, { col:6, row:2 }, { col:10, row:2 },
  { col:2, row:8 }, { col:6, row:8 }, { col:10, row:8 },
]
export const DEFAULT_DESKS_22 = [
  { col:2, row:2 }, { col:6, row:2 }, { col:10, row:2 }, { col:14, row:2 },
  { col:2, row:8 }, { col:6, row:8 }, { col:10, row:8 }, { col:14, row:8 },
]

export const DEFAULT_SALAS: SalaConfig[] = [
  { id:'principal',     nome:'Sala Principal',    theme:'moderno', cols:16, desks:DEFAULT_DESKS_16 },
  { id:'especialistas', nome:'Sala Especialistas', theme:'retro',  cols:16, desks:DEFAULT_DESKS_16 },
  { id:'escritorio',    nome:'Escritório Geral',   theme:'retro',  cols:22, desks:DEFAULT_DESKS_22 },
]
