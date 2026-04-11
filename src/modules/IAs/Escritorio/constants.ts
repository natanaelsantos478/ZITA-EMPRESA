export const TILE   = 32   // px per tile on screen
export const PIXEL  = 4    // 1 art-pixel = 4 real px
export const GRID_W = 24   // tiles wide
export const GRID_H = 18   // tiles tall

export const STATUS_COLOR: Record<string, string> = {
  online: '#22c55e', ocupada: '#eab308', aguardando: '#3b82f6',
  offline: '#6b7280', erro: '#ef4444', pausada: '#f97316',
}

export const FURNITURE_SIZES: Record<string, [number, number]> = {
  desk:       [2, 1],
  chair:      [1, 1],
  monitor:    [1, 1],
  plant:      [1, 1],
  bookshelf:  [1, 2],
  sofa:       [3, 1],
  meetingTable: [4, 2],
  coffee:     [1, 1],
  trash:      [1, 1],
  lamp:       [1, 1],
  rug:        [4, 3],   // walkable
  cabinet:    [1, 2],
  printer:    [1, 1],
  wallArt:    [1, 1],   // walkable
}

export const WALKABLE = new Set(['rug', 'wallArt'])
