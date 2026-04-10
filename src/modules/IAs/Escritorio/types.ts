export type ThemeName = 'retro' | 'moderno' | 'profissional'

export interface Theme {
  // floor
  floor1: string; floor2: string; floorGrain: string
  // walls
  wall: string; wallTop: string; wallShadow: string
  // furniture
  desk: string; deskHL: string; deskShadow: string
  chair: string; chairHL: string
  plant: string; plantPot: string
  screen: string; screenOn: string; screenGlow: string
  carpet: string
  // misc
  bg: string        // canvas background (outside room)
  roomBg: string    // fallback room tint
  label: string; emoji: string
}

export type FurnitureType =
  | 'desk' | 'chair' | 'monitor' | 'plant' | 'bookshelf'
  | 'sofa' | 'meetingTable' | 'coffee' | 'trash' | 'lamp'
  | 'rug' | 'cabinet' | 'printer' | 'wallArt'

export interface FurnitureItem {
  id: string
  type: FurnitureType
  tileX: number
  tileY: number
  rotation: 0 | 90 | 180 | 270
}

export interface AgentPosition {
  agentId: string
  tileX: number
  tileY: number
}

export interface EscritorioSave {
  theme: ThemeName
  bgLight: boolean
  furniture: FurnitureItem[]
  agentPositions: AgentPosition[]
}

export interface Camera {
  x: number; y: number
  targetX: number; targetY: number
  zoom: number; targetZoom: number
}

export type EditorMode = 'none' | 'place' | 'drag'

export interface EditorState {
  active: boolean
  mode: EditorMode
  placingType: FurnitureType | null
  selectedId: string | null
  dragOffsetX: number
  dragOffsetY: number
  cursorTileX: number
  cursorTileY: number
  hoverOccupied: boolean
}
