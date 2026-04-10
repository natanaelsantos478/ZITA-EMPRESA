/**
 * Office2DView.tsx — Game-style 2D office
 * 3 global layouts: retro | modern | professional
 * Animations: idle bob, working typing, walking, speech bubbles
 * AI-to-AI: reacts to ia_mensagens INSERT events via useRealtime
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Grid3X3 } from 'lucide-react'
import type { IaAgent, IaMensagem } from '../../../types'
import { useAuth } from '../../../contexts/AuthContext'
import { useRealtime } from '../../../hooks/useRealtime'

// ─── Core constants ───────────────────────────────────────────────────────────
const TILE      = 48
const WALL_T    = 14
const CORR_W    = 3 * TILE
const ROWS      = 14
const WALK_SPEED = 0.025

const STATUS_COLOR: Record<string, string> = {
  online:'#22c55e', ocupada:'#eab308', aguardando:'#3b82f6',
  offline:'#6b7280', erro:'#ef4444', pausada:'#f97316',
}

// ─── Layout system ────────────────────────────────────────────────────────────
type LayoutName = 'retro' | 'modern' | 'professional'

interface LP {
  bg:string; f1:string; f2:string; grid:string
  wall:string; wallHL:string; wallAcc:string
  desk:string; deskHL:string
  mon:string; glow:string
  corr:string; corrD:string
  txt:string; label:string; emoji:string
}

const LAYOUTS: Record<LayoutName, LP> = {
  retro: {
    bg:'#1a0f05', f1:'#3d2d0f', f2:'#352809', grid:'#2a1d08',
    wall:'#5a3d1a', wallHL:'#7c5528', wallAcc:'#c8a84b',
    desk:'#6b4a1e', deskHL:'#a07840',
    mon:'#1a1000', glow:'#e8a020',
    corr:'#1a0e04', corrD:'#c8a84b',
    txt:'#f5deb3', label:'Retrô', emoji:'🪵',
  },
  modern: {
    bg:'#eef2f7', f1:'#f0f4f8', f2:'#e8edf2', grid:'#dde3ea',
    wall:'#c8d4e0', wallHL:'#a0b4c8', wallAcc:'#4a9eff',
    desk:'#ffffff', deskHL:'#d0dcea',
    mon:'#1a2030', glow:'#4a9eff',
    corr:'#dde6f0', corrD:'#4a9eff',
    txt:'#1a2030', label:'Moderno', emoji:'🏢',
  },
  professional: {
    bg:'#0d0f1a', f1:'#0d0f1a', f2:'#0d0f1a', grid:'#141620',
    wall:'#1a1e2e', wallHL:'#252a3a', wallAcc:'#3a4060',
    desk:'#1a1e2e', deskHL:'#252a3a',
    mon:'#0a0c14', glow:'#3a80ff',
    corr:'#08090f', corrD:'#1e2234',
    txt:'#a0b0d0', label:'Profissional', emoji:'⬛',
  },
}

// ─── Room config ──────────────────────────────────────────────────────────────
interface SalaConfig {
  id: string; nome: string; cols: number
  desks: Array<{ col: number; row: number }>
}

const DESKS16 = [
  {col:2,row:2},{col:6,row:2},{col:10,row:2},
  {col:2,row:8},{col:6,row:8},{col:10,row:8},
]
const DESKS22 = [
  {col:2,row:2},{col:6,row:2},{col:10,row:2},{col:14,row:2},
  {col:2,row:8},{col:6,row:8},{col:10,row:8},{col:14,row:8},
]
const DEFAULT_SALAS: SalaConfig[] = [
  {id:'principal',    nome:'Sala Principal',    cols:16, desks:DESKS16},
  {id:'especialistas',nome:'Sala Especialistas', cols:16, desks:DESKS16},
  {id:'escritorio',   nome:'Escritório Geral',   cols:22, desks:DESKS22},
]

// ─── Animation state ──────────────────────────────────────────────────────────
interface AgentAnim {
  state: 'idle'|'working'|'walking'|'talking'
  x: number; y: number
  homeX: number; homeY: number
  fromX: number; fromY: number
  targetX: number; targetY: number
  walkProgress: number
  walkPhase: number
  workTimer: number
  idlePhase: number
  bubble?: { text: string; expiresAt: number }
  afterWalk?: 'goHome'|'talk'
  talkTarget?: string
}

// ─── Floor draw ───────────────────────────────────────────────────────────────
function drawFloor(ctx: CanvasRenderingContext2D, p: LP, layout: LayoutName, sala: SalaConfig, ox: number) {
  const W = sala.cols * TILE, H = ROWS * TILE
  if (layout === 'professional') {
    ctx.fillStyle = p.f1; ctx.fillRect(ox, 0, W, H)
    ctx.strokeStyle = p.grid; ctx.lineWidth = 0.5
    for (let c = 0; c <= sala.cols; c += 2) {
      ctx.beginPath(); ctx.moveTo(ox+c*TILE,0); ctx.lineTo(ox+c*TILE,H); ctx.stroke()
    }
    for (let r = 0; r <= ROWS; r += 2) {
      ctx.beginPath(); ctx.moveTo(ox,r*TILE); ctx.lineTo(ox+W,r*TILE); ctx.stroke()
    }
    return
  }
  // Checkerboard tiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < sala.cols; c++) {
      ctx.fillStyle = (r+c)%2===0 ? p.f1 : p.f2
      ctx.fillRect(ox+c*TILE, r*TILE, TILE, TILE)
    }
  }
  if (layout === 'retro') {
    // Diagonal grain
    ctx.strokeStyle = 'rgba(200,168,75,0.05)'; ctx.lineWidth = 1
    for (let i = 0; i < W+H; i += 28) {
      ctx.beginPath(); ctx.moveTo(ox+i,0); ctx.lineTo(ox,i); ctx.stroke()
    }
  }
  ctx.strokeStyle = p.grid; ctx.lineWidth = 0.5
  for (let c = 0; c <= sala.cols; c++) {
    ctx.beginPath(); ctx.moveTo(ox+c*TILE,0); ctx.lineTo(ox+c*TILE,H); ctx.stroke()
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(ox,r*TILE); ctx.lineTo(ox+W,r*TILE); ctx.stroke()
  }
}

// ─── Wall draw ────────────────────────────────────────────────────────────────
function drawWall(ctx: CanvasRenderingContext2D, p: LP, layout: LayoutName, sala: SalaConfig, ox: number) {
  const W = sala.cols * TILE, H = ROWS * TILE
  ctx.fillStyle = p.wall
  ctx.fillRect(ox,0,W,WALL_T); ctx.fillRect(ox,H-WALL_T,W,WALL_T)
  ctx.fillRect(ox,0,WALL_T,H); ctx.fillRect(ox+W-WALL_T,0,WALL_T,H)
  if (layout === 'retro') {
    // Brick lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.8
    for (let bx = 0; bx < W; bx += 18) {
      ctx.beginPath(); ctx.moveTo(ox+bx,0); ctx.lineTo(ox+bx,WALL_T); ctx.stroke()
    }
    for (let by = 4; by < WALL_T; by += 4) {
      ctx.beginPath(); ctx.moveTo(ox,by); ctx.lineTo(ox+W,by); ctx.stroke()
    }
  }
  // Accent edge
  ctx.fillStyle = p.wallAcc
  ctx.fillRect(ox,0,W,3); ctx.fillRect(ox,H-3,W,3)
  ctx.fillRect(ox,0,3,H); ctx.fillRect(ox+W-3,0,3,H)
  // Room name
  ctx.font = layout==='retro' ? 'bold 13px monospace' : '13px "Segoe UI",sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillStyle = layout==='professional' ? 'rgba(160,176,208,0.2)' : 'rgba(255,255,255,0.1)'
  ctx.fillText(sala.nome.toUpperCase(), ox+W/2, H-18)
}

// ─── Desk draw ────────────────────────────────────────────────────────────────
function drawDesk(
  ctx: CanvasRenderingContext2D, p: LP, layout: LayoutName,
  ox: number, col: number, row: number,
  agentName?: string, agentStatus?: string
) {
  const px = ox+col*TILE, py = row*TILE
  const dw = TILE*2.6, dh = TILE*1.3, cx = px+dw/2

  if (layout === 'professional') {
    // Technical flat box
    ctx.fillStyle = p.desk; ctx.fillRect(px,py,dw,dh)
    ctx.strokeStyle = p.wallHL; ctx.lineWidth = 1; ctx.strokeRect(px,py,dw,dh)
    // Corner brackets
    ctx.strokeStyle = p.glow+'88'; ctx.lineWidth = 1.5
    const bz=7
    ;([[px,py,1,1],[px+dw,py,-1,1],[px,py+dh,1,-1],[px+dw,py+dh,-1,-1]] as [number,number,number,number][])
      .forEach(([bx,by,sx,sy])=>{
        ctx.beginPath(); ctx.moveTo(bx,by+sy*bz); ctx.lineTo(bx,by); ctx.lineTo(bx+sx*bz,by); ctx.stroke()
      })
    if (agentName) {
      ctx.font='9px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'
      ctx.fillStyle=p.txt+'aa'
      ctx.fillText(agentName.slice(0,12), cx, py+dh/2-4)
      if (agentStatus) {
        ctx.fillStyle=STATUS_COLOR[agentStatus]??'#6b7280'
        ctx.beginPath(); ctx.arc(cx,py+dh/2+7,3,0,Math.PI*2); ctx.fill()
      }
    }
    return
  }

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.35)'
  ctx.beginPath(); ctx.roundRect(px+4,py+4,dw,dh,5); ctx.fill()
  // Surface
  ctx.fillStyle=p.desk
  ctx.beginPath(); ctx.roundRect(px,py,dw,dh,5); ctx.fill()
  if (layout==='retro') {
    // Wood grain
    ctx.strokeStyle=p.deskHL; ctx.lineWidth=1
    for (let g=6; g<dw; g+=8) {
      ctx.beginPath(); ctx.moveTo(px+g,py+2); ctx.lineTo(px+g,py+dh-2); ctx.stroke()
    }
    ctx.strokeStyle=p.deskHL; ctx.lineWidth=2
    ctx.beginPath(); ctx.roundRect(px+2,py+2,dw-4,dh-4,4); ctx.stroke()
    // CRT monitor
    const mw=30,mh=22,mx=cx-mw/2,my=py+5
    ctx.fillStyle='#2a1800'; ctx.fillRect(mx-3,my-3,mw+6,mh+8)
    ctx.fillStyle=p.mon; ctx.fillRect(mx,my,mw,mh)
    ctx.fillStyle=p.glow+'55'; ctx.fillRect(mx+2,my+2,mw-4,mh-4)
    ctx.fillStyle='rgba(0,0,0,0.12)'
    for (let sl=my+2;sl<my+mh-2;sl+=3) ctx.fillRect(mx+2,sl,mw-4,1)
    ctx.fillStyle='#1a0e00'; ctx.fillRect(cx-3,my+mh,6,5); ctx.fillRect(cx-8,my+mh+4,16,3)
  } else {
    // Modern glass desk
    ctx.strokeStyle=p.deskHL; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.roundRect(px+1,py+1,dw-2,dh-2,5); ctx.stroke()
    const mw=32,mh=20,mx=cx-mw/2,my=py+6
    ctx.fillStyle=p.mon; ctx.beginPath(); ctx.roundRect(mx,my,mw,mh,3); ctx.fill()
    ctx.fillStyle=p.glow+'44'; ctx.beginPath(); ctx.roundRect(mx+2,my+2,mw-4,mh-4,2); ctx.fill()
    ctx.fillStyle='#8090a0'; ctx.fillRect(cx-2,my+mh,4,5); ctx.fillRect(cx-8,my+mh+4,16,2)
    // LED strip
    ctx.fillStyle=p.glow+'bb'; ctx.fillRect(px+4,py+dh-4,dw-8,3)
  }
  // Chair
  const cy2=py+dh+6
  ctx.fillStyle=layout==='retro'?'#2a1a00':'#b0c4d8'
  ctx.beginPath(); ctx.ellipse(cx,cy2+12,18,12,0,0,Math.PI*2); ctx.fill()
  ctx.fillStyle=layout==='retro'?'#3d2a00':'#90aac0'
  ctx.fillRect(cx-14,cy2,28,7); ctx.fillRect(cx-11,cy2-10,22,11)
}

// ─── Corridor draw ────────────────────────────────────────────────────────────
function drawCorridor(ctx: CanvasRenderingContext2D, p: LP, layout: LayoutName, ox: number) {
  const H = ROWS*TILE
  ctx.fillStyle=p.corr; ctx.fillRect(ox,0,CORR_W,H)
  if (layout==='retro') {
    const rw=CORR_W*0.45, rx=ox+(CORR_W-rw)/2
    ctx.fillStyle='#5a1a00'; ctx.fillRect(rx,0,rw,H)
    ctx.strokeStyle=p.corrD; ctx.lineWidth=1.5; ctx.strokeRect(rx+3,3,rw-6,H-6)
  } else if (layout==='modern') {
    for (let py=TILE*2;py<H;py+=TILE*4) {
      ctx.fillStyle='#22c55e55'
      ctx.beginPath(); ctx.arc(ox+CORR_W/2,py,10,0,Math.PI*2); ctx.fill()
      ctx.fillStyle='#166534'; ctx.fillRect(ox+CORR_W/2-2,py,4,12)
    }
  } else {
    ctx.strokeStyle=p.corrD; ctx.lineWidth=1; ctx.setLineDash([6,8])
    ctx.beginPath(); ctx.moveTo(ox+CORR_W/2,0); ctx.lineTo(ox+CORR_W/2,H); ctx.stroke()
    ctx.setLineDash([])
  }
}

// ─── Agent draw ───────────────────────────────────────────────────────────────
function drawAgent(
  ctx: CanvasRenderingContext2D, p: LP, layout: LayoutName,
  agent: IaAgent, anim: AgentAnim, pulse: number, hovered: boolean, selected: boolean
) {
  const cx = anim.x
  const bob =
    anim.state==='working' ? Math.sin(anim.workTimer*4)*1.5 :
    anim.state==='idle'    ? Math.sin(anim.idlePhase)*1.5   : 0
  const cy = anim.y + bob

  // Selection / hover rings
  if (selected) {
    ctx.strokeStyle=layout==='professional'?(STATUS_COLOR[agent.status]??'#3a80ff'):'#7487ff'
    ctx.lineWidth=2.5
    ctx.beginPath(); ctx.arc(cx,cy,24,0,Math.PI*2); ctx.stroke()
    ctx.strokeStyle=(layout==='professional'?(STATUS_COLOR[agent.status]??'#3a80ff'):'#7487ff')+'33'
    ctx.lineWidth=7
    ctx.beginPath(); ctx.arc(cx,cy,31,0,Math.PI*2); ctx.stroke()
  } else if (hovered) {
    ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=2
    ctx.beginPath(); ctx.arc(cx,cy,22,0,Math.PI*2); ctx.stroke()
  }

  // Ocupada pulse ring
  if (agent.status==='ocupada') {
    ctx.strokeStyle=`rgba(234,179,8,${0.2+pulse*0.5})`; ctx.lineWidth=2
    ctx.beginPath(); ctx.arc(cx,cy,20+pulse*5,0,Math.PI*2); ctx.stroke()
  }

  if (layout==='professional') {
    // Just a colored circle
    ctx.fillStyle='rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.arc(cx+2,cy+2,13,0,Math.PI*2); ctx.fill()
    ctx.fillStyle=agent.cor_hex||'#3a80ff'
    ctx.beginPath(); ctx.arc(cx,cy,13,0,Math.PI*2); ctx.fill()
    ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.arc(cx,cy,13,0,Math.PI*2); ctx.stroke()
  } else {
    // Walking legs
    if (anim.state==='walking') {
      const legSwing=Math.sin(anim.walkPhase*8)*8
      ctx.strokeStyle=layout==='retro'?(agent.cor_hex||'#6b4a1e'):'#8090a0'
      ctx.lineWidth=layout==='retro'?4:3; ctx.lineCap='round'
      ctx.beginPath(); ctx.moveTo(cx-4,cy+10); ctx.lineTo(cx-4+legSwing,cy+22); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx+4,cy+10); ctx.lineTo(cx+4-legSwing,cy+22); ctx.stroke()
    }
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.25)'
    ctx.beginPath(); ctx.ellipse(cx+3,cy+5,12,7,0,0,Math.PI*2); ctx.fill()
    // Body
    ctx.fillStyle=agent.cor_hex||'#4e5eff'
    ctx.beginPath(); ctx.roundRect(cx-10,cy-2,20,15,layout==='modern'?5:3); ctx.fill()
    if (layout==='retro') {
      ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fillRect(cx-3,cy-2,6,15)
    } else {
      ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.fillRect(cx-2,cy-2,4,15)
    }
    // Head
    ctx.fillStyle=layout==='retro'?'#e8c49a':'#fce8d0'
    ctx.beginPath(); ctx.arc(cx,cy-12,layout==='retro'?10:9,0,Math.PI*2); ctx.fill()
    // Eyes
    ctx.fillStyle=layout==='retro'?'#3a2200':'#1a2030'
    ctx.beginPath(); ctx.arc(cx-3.5,cy-13,1.5,0,Math.PI*2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx+3.5,cy-13,1.5,0,Math.PI*2); ctx.fill()
    // Hat / Crown
    if (agent.tipo==='zeus') {
      ctx.fillStyle='#f59e0b'
      ctx.beginPath()
      ctx.moveTo(cx-10,cy-22); ctx.lineTo(cx-7,cy-30)
      ctx.lineTo(cx,cy-25); ctx.lineTo(cx+7,cy-30)
      ctx.lineTo(cx+10,cy-22); ctx.closePath(); ctx.fill()
    } else if (layout==='retro') {
      ctx.fillStyle=agent.cor_hex||'#6b4a1e'
      ctx.fillRect(cx-11,cy-23,22,6); ctx.fillRect(cx-8,cy-26,16,4)
    }
    // Typing animation
    if (anim.state==='working') {
      const ka=0.3+Math.sin(anim.workTimer*6)*0.3
      ctx.fillStyle=`rgba(${layout==='retro'?'232,160,32':'74,158,255'},${ka})`
      ctx.fillRect(cx-8,cy+9,16,4)
    }
  }

  // Status dot
  ctx.fillStyle=STATUS_COLOR[agent.status]??'#6b7280'
  ctx.beginPath(); ctx.arc(cx+(layout==='professional'?11:10),cy+(layout==='professional'?11:11),4,0,Math.PI*2); ctx.fill()
  ctx.strokeStyle=layout==='modern'?'#fff':'#1a0f05'; ctx.lineWidth=1.5; ctx.stroke()

  // Name label
  const labelY = layout==='professional' ? cy+17 : cy+19
  ctx.font=`${selected?'bold':'normal'} ${layout==='professional'?'9px monospace':'10px "Segoe UI",sans-serif'}`
  const lbl=agent.nome.length>10?agent.nome.slice(0,9)+'…':agent.nome
  const tw=ctx.measureText(lbl).width
  ctx.fillStyle=layout==='modern'?'rgba(26,32,48,0.85)':'rgba(10,8,0,0.8)'
  ctx.beginPath(); ctx.roundRect(cx-tw/2-4,labelY,tw+8,13,3); ctx.fill()
  ctx.fillStyle=layout==='professional'?p.txt:'#e8f0ff'
  ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(lbl,cx,labelY+6.5)

  // Speech bubble
  if (anim.bubble && Date.now()<anim.bubble.expiresAt) {
    drawBubble(ctx, anim.bubble.text, cx, cy-5)
  }

  // Return hit bounds for click detection
  const hitR = layout==='professional' ? 18 : 26
  return { id: agent.id, cx, cy, r: hitR }
}

// ─── Room offsets ─────────────────────────────────────────────────────────────
function calcOffsets(salas: SalaConfig[]): number[] {
  let x=0
  return salas.map(s=>{ const o=x; x+=s.cols*TILE+CORR_W; return o })
}

// ─── SalaModal ────────────────────────────────────────────────────────────────
function SalaModal({ sala, onSave, onClose }: {
  sala?: SalaConfig
  onSave: (d: Omit<SalaConfig,'id'>) => void
  onClose: () => void
}) {
  const [nome,setNome]=useState(sala?.nome??'')
  const [cols,setCols]=useState(sala?.cols??16)
  const save=()=>{
    if(!nome.trim())return
    onSave({nome,cols,desks:sala?.desks??(cols>=22?DESKS22:DESKS16)})
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-72 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <h3 className="text-white font-semibold mb-4">{sala?'Editar sala':'Nova sala'}</h3>
        <label className="block text-xs text-gray-400 mb-1">Nome</label>
        <input autoFocus value={nome} onChange={e=>setNome(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-4 outline-none focus:border-blue-500"/>
        <label className="block text-xs text-gray-400 mb-2">Tamanho (tiles)</label>
        <div className="flex gap-2 mb-5">
          {[12,16,22,28].map(c=>(
            <button key={c} onClick={()=>setCols(c)}
              className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                cols===c?'border-blue-500 bg-blue-500/10 text-white':'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}>{c}</button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">Cancelar</button>
          <button onClick={save} disabled={!nome.trim()} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  agents: IaAgent[]
  tarefasCounts: Record<string,number>
  onSelectAgent: (a: IaAgent) => void
  onChat: (a: IaAgent) => void
  selectedId?: string
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Office2DView({ agents, onSelectAgent, selectedId }: Props) {
  const { companyId, isAdmin } = useAuth()
  const salasKey   = `${companyId}_office2d_salas`
  const layoutKey  = `${companyId}_office2d_layout`

  // ── Persistent state ──────────────────────────────────────────────────────
  const [salas,setSalas]=useState<SalaConfig[]>(()=>{
    try{ const r=localStorage.getItem(salasKey); if(r)return JSON.parse(r) }catch{}
    return DEFAULT_SALAS
  })
  const [layout,setLayoutState]=useState<LayoutName>(()=>{
    const v=localStorage.getItem(layoutKey)
    return (v==='retro'||v==='modern'||v==='professional'?v:'retro') as LayoutName
  })
  const setLayout=(l:LayoutName)=>{ setLayoutState(l); localStorage.setItem(layoutKey,l) }

  // ── UI state ──────────────────────────────────────────────────────────────
  const [zoom,setZoom]           = useState(1.0)
  const [pan,setPan]             = useState({x:0,y:0})
  const [hoveredId,setHoveredId] = useState<string|null>(null)
  const [tooltip,setTooltip]     = useState<{x:number;y:number;agent:IaAgent}|null>(null)
  const [editMode,setEditMode]   = useState(false)
  const [hoverTile,setHoverTile] = useState<{si:number;col:number;row:number}|null>(null)
  const [showSalaPanel,setShowSalaPanel]=useState(false)
  const [addSalaModal,setAddSalaModal]  =useState(false)
  const [editSala,setEditSala]          =useState<SalaConfig|null>(null)

  // ── Canvas / animation refs ───────────────────────────────────────────────
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const boundsRef   = useRef<Array<{id:string;cx:number;cy:number;r:number}>>([])
  const animRef     = useRef<number>(0)
  const timeRef     = useRef(0)
  const panningRef  = useRef(false)
  const panStartRef = useRef({mx:0,my:0,px:0,py:0})
  const animsRef    = useRef<Map<string,AgentAnim>>(new Map())

  // Keep a ref to latest agents/layout so draw can read without stale closures
  const agentsRef   = useRef(agents)
  const layoutRef   = useRef(layout)
  const salasRef    = useRef(salas)
  useEffect(()=>{ agentsRef.current=agents },[agents])
  useEffect(()=>{ layoutRef.current=layout },[layout])
  useEffect(()=>{ salasRef.current=salas },[salas])

  // ── Persist salas ─────────────────────────────────────────────────────────
  useEffect(()=>{ localStorage.setItem(salasKey,JSON.stringify(salas)) },[salas,salasKey])

  // ── Memoized derived values ───────────────────────────────────────────────
  const offsets = useMemo(()=>calcOffsets(salas),[salas])
  const WORLD_W = useMemo(()=>salas.reduce((a,s)=>a+s.cols*TILE+CORR_W,0),[salas])
  const WORLD_H = ROWS*TILE

  // ── Assign agents to rooms (stable) ──────────────────────────────────────
  const agentsForSala = useCallback((idx:number): IaAgent[] => {
    const zeus=agents.filter(a=>a.tipo==='zeus')
    const esp =agents.filter(a=>a.tipo==='especialista')
    const rest=agents.filter(a=>a.tipo!=='zeus'&&a.tipo!=='especialista')
    if(idx===0) return zeus
    if(idx===1) return esp
    const ri=idx-2
    const perRoom=Math.ceil(rest.length/Math.max(1,salas.length-2))
    return rest.slice(ri*perRoom,(ri+1)*perRoom)
  },[agents,salas])

  // ── Desk position helper ──────────────────────────────────────────────────
  const deskPos = useCallback((si:number,di:number):{x:number;y:number}=>{
    const sala=salas[si]; if(!sala)return{x:0,y:0}
    const slot=sala.desks[di%sala.desks.length]
    if(!slot)return{x:0,y:0}
    const dw=TILE*2.6, dh=TILE*1.3
    return {
      x: offsets[si]+slot.col*TILE+dw/2,
      y: slot.row*TILE+dh+TILE*0.95
    }
  },[salas,offsets])

  // ── Initialize/sync agent animations ─────────────────────────────────────
  useEffect(()=>{
    const map=animsRef.current
    salas.forEach((_,si)=>{
      agentsForSala(si).forEach((agent,ai)=>{
        const pos=deskPos(si,ai)
        const existing=map.get(agent.id)
        if(!existing){
          map.set(agent.id,{
            state: agent.status==='ocupada'?'working':'idle',
            x:pos.x, y:pos.y, homeX:pos.x, homeY:pos.y,
            fromX:pos.x, fromY:pos.y, targetX:pos.x, targetY:pos.y,
            walkProgress:1, walkPhase:0,
            workTimer:Math.random()*Math.PI*2,
            idlePhase:Math.random()*Math.PI*2,
          })
        } else {
          // Update home position if desk moved
          existing.homeX=pos.x; existing.homeY=pos.y
          // Sync working state with status
          if(existing.state==='idle'&&agent.status==='ocupada') existing.state='working'
          if(existing.state==='working'&&agent.status!=='ocupada') existing.state='idle'
        }
      })
    })
    // Remove stale entries
    const allIds=new Set(agents.map(a=>a.id))
    map.forEach((_,id)=>{ if(!allIds.has(id))map.delete(id) })
  },[agents,salas,agentsForSala,deskPos])

  // ── AI-to-AI communication (realtime) ────────────────────────────────────
  useRealtime<IaMensagem>(
    'ia_mensagens',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (msg)=>{
      if(msg.remetente_tipo!=='ia'||!msg.remetente_id) return
      const senderAnim=animsRef.current.get(msg.remetente_id)
      if(!senderAnim||senderAnim.state==='walking') return
      // Find first other agent to walk toward
      let targetX=senderAnim.homeX+40, targetY=senderAnim.homeY
      animsRef.current.forEach((ta,id)=>{
        if(id!==msg.remetente_id){ targetX=ta.homeX; targetY=ta.homeY }
      })
      senderAnim.fromX=senderAnim.x; senderAnim.fromY=senderAnim.y
      senderAnim.targetX=targetX; senderAnim.targetY=targetY
      senderAnim.walkProgress=0; senderAnim.state='walking'
      senderAnim.afterWalk='talk'
      senderAnim.bubble={text:msg.conteudo.slice(0,120), expiresAt:Date.now()+4500}
    },
    'INSERT'
  )

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return
    const parent=canvas.parentElement; if(!parent)return
    const ro=new ResizeObserver(()=>{
      canvas.width=parent.clientWidth; canvas.height=parent.clientHeight
    })
    ro.observe(parent)
    canvas.width=parent.clientWidth; canvas.height=parent.clientHeight
    return ()=>ro.disconnect()
  },[])

  // ── Coordinate helper ─────────────────────────────────────────────────────
  const canvasToWorld=useCallback((cx:number,cy:number,canvas:HTMLCanvasElement)=>{
    const offX=pan.x+canvas.width/2-(WORLD_W*zoom)/2
    const offY=pan.y+canvas.height/2-(WORLD_H*zoom)/2
    return {wx:(cx-offX)/zoom, wy:(cy-offY)/zoom}
  },[pan,zoom,WORLD_W,WORLD_H])

  // ── Main draw + animation loop ────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return

    const loop=()=>{
      animRef.current=requestAnimationFrame(loop)
      const ctx=canvas.getContext('2d'); if(!ctx)return
      timeRef.current+=0.02
      const pulse=(Math.sin(timeRef.current)+1)/2
      const now=Date.now()

      // Update animation states
      animsRef.current.forEach((a,id)=>{
        a.idlePhase+=0.04; a.workTimer+=0.04
        if(a.state==='walking'){
          a.walkProgress=Math.min(1,a.walkProgress+WALK_SPEED)
          a.walkPhase+=WALK_SPEED*2
          a.x=a.fromX+(a.targetX-a.fromX)*a.walkProgress
          a.y=a.fromY+(a.targetY-a.fromY)*a.walkProgress
          if(a.walkProgress>=1){
            a.x=a.targetX; a.y=a.targetY
            if(a.afterWalk==='talk'){
              a.state='talking'
              const agent=agentsRef.current.find(ag=>ag.id===id)
              if(agent&&a.bubble){ a.bubble.expiresAt=now+4000 }
              // Schedule walk home
              setTimeout(()=>{
                const cur=animsRef.current.get(id); if(!cur)return
                cur.fromX=cur.x; cur.fromY=cur.y
                cur.targetX=cur.homeX; cur.targetY=cur.homeY
                cur.walkProgress=0; cur.state='walking'; cur.afterWalk='goHome'
              }, 4200)
            } else {
              a.state='working'; a.x=a.homeX; a.y=a.homeY
              a.afterWalk=undefined
            }
          }
        }
        if(a.state==='talking'&&a.bubble&&now>a.bubble.expiresAt){
          a.bubble=undefined
        }
      })

      // Clear
      const curLayout=layoutRef.current
      const curSalas=salasRef.current
      const curOffsets=calcOffsets(curSalas)
      const curP=LAYOUTS[curLayout]
      const ww=curSalas.reduce((ac,s)=>ac+s.cols*TILE+CORR_W,0)
      ctx.fillStyle=curP.bg; ctx.fillRect(0,0,canvas.width,canvas.height)
      ctx.save()
      ctx.translate(pan.x+canvas.width/2-(ww*zoom)/2, pan.y+canvas.height/2-(WORLD_H*zoom)/2)
      ctx.scale(zoom,zoom)

      // Rooms
      curSalas.forEach((sala,i)=>{
        if(i>0) drawCorridor(ctx,curP,curLayout,curOffsets[i]-CORR_W)
        drawFloor(ctx,curP,curLayout,sala,curOffsets[i])
        drawWall(ctx,curP,curLayout,sala,curOffsets[i])

        // Desks — for professional layout pass agent info
        const roomAgents=agentsForSala(i)
        sala.desks.forEach((d,di)=>{
          const agent=roomAgents[di]
          drawDesk(ctx,curP,curLayout,curOffsets[i],d.col,d.row,
            curLayout==='professional'?agent?.nome:undefined,
            curLayout==='professional'?agent?.status:undefined
          )
        })
      })

      // Edit mode: tile hover
      if(editMode&&hoverTile){
        const ox=curOffsets[hoverTile.si]
        ctx.fillStyle='rgba(250,204,21,0.2)'
        ctx.fillRect(ox+hoverTile.col*TILE,hoverTile.row*TILE,TILE,TILE)
      }

      // Agents
      const newBounds: typeof boundsRef.current=[]
      curSalas.forEach((_,i)=>{
        agentsForSala(i).forEach((agent,ai)=>{
          const anim=animsRef.current.get(agent.id)
          if(!anim) return
          const b=drawAgent(ctx,curP,curLayout,agent,anim,pulse,
            agent.id===hoveredId, agent.id===selectedId)
          newBounds.push(b)
        })
      })
      boundsRef.current=newBounds
      ctx.restore()
    }

    animRef.current=requestAnimationFrame(loop)
    return ()=>cancelAnimationFrame(animRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[zoom,pan,hoveredId,selectedId,editMode,hoverTile,agentsForSala,deskPos,WORLD_H])

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseMove=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const canvas=canvasRef.current; if(!canvas)return
    const rect=canvas.getBoundingClientRect()
    const mx=e.clientX-rect.left, my=e.clientY-rect.top
    if(panningRef.current){
      setPan({x:panStartRef.current.px+(mx-panStartRef.current.mx), y:panStartRef.current.py+(my-panStartRef.current.my)})
      return
    }
    const {wx,wy}=canvasToWorld(mx,my,canvas)
    if(editMode){
      let found: typeof hoverTile=null
      salasRef.current.forEach((sala,i)=>{
        const ox=calcOffsets(salasRef.current)[i]
        if(wx>=ox&&wx<ox+sala.cols*TILE&&wy>=0&&wy<ROWS*TILE)
          found={si:i,col:Math.floor((wx-ox)/TILE),row:Math.floor(wy/TILE)}
      })
      setHoverTile(found); return
    }
    let hit: string|null=null
    for(const b of boundsRef.current){
      if(Math.hypot(wx-b.cx,wy-b.cy)<=b.r){hit=b.id;break}
    }
    setHoveredId(hit)
    if(hit){
      const agent=agents.find(a=>a.id===hit)
      if(agent) setTooltip({x:e.clientX,y:e.clientY,agent})
    } else setTooltip(null)
  },[agents,canvasToWorld,editMode])

  const handleMouseDown=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    if(e.button!==0)return
    if(!hoveredId&&!editMode){
      panningRef.current=true
      const rect=canvasRef.current!.getBoundingClientRect()
      panStartRef.current={mx:e.clientX-rect.left,my:e.clientY-rect.top,px:pan.x,py:pan.y}
    }
  },[hoveredId,editMode,pan])

  const handleMouseUp=useCallback(()=>{panningRef.current=false},[])

  const handleClick=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const canvas=canvasRef.current; if(!canvas)return
    const rect=canvas.getBoundingClientRect()
    const {wx,wy}=canvasToWorld(e.clientX-rect.left,e.clientY-rect.top,canvas)
    if(editMode&&hoverTile){
      setSalas(prev=>prev.map((sala,i)=>{
        if(i!==hoverTile.si)return sala
        const {col,row}=hoverTile
        const exists=sala.desks.some(d=>d.col===col&&d.row===row)
        return{...sala,desks:exists?sala.desks.filter(d=>!(d.col===col&&d.row===row)):[...sala.desks,{col,row}]}
      })); return
    }
    for(const b of boundsRef.current){
      if(Math.hypot(wx-b.cx,wy-b.cy)<=b.r){
        const agent=agents.find(a=>a.id===b.id)
        if(agent)onSelectAgent(agent); return
      }
    }
  },[agents,canvasToWorld,editMode,hoverTile,onSelectAgent])

  const handleWheel=useCallback((e:React.WheelEvent)=>{
    e.preventDefault()
    setZoom(z=>Math.min(2.5,Math.max(0.3,z-e.deltaY*0.001)))
  },[])

  // ── Sala management ───────────────────────────────────────────────────────
  const addSala   =(d:Omit<SalaConfig,'id'>)=>setSalas(p=>[...p,{...d,id:crypto.randomUUID()}])
  const updateSala=(id:string,d:Omit<SalaConfig,'id'>)=>setSalas(p=>p.map(s=>s.id===id?{...s,...d}:s))
  const deleteSala=(id:string)=>setSalas(p=>p.filter(s=>s.id!==id))
  const moveSala  =(id:string,dir:-1|1)=>setSalas(p=>{
    const idx=p.findIndex(s=>s.id===id), ni=idx+dir
    if(ni<0||ni>=p.length)return p
    const n=[...p];[n[idx],n[ni]]=[n[ni],n[idx]];return n
  })

  // ── Animation counter (for status bar) ───────────────────────────────────
  const [animCount,setAnimCount]=useState({working:0,walking:0,talking:0})
  useEffect(()=>{
    const t=setInterval(()=>{
      let working=0,walking=0,talking=0
      animsRef.current.forEach(a=>{
        if(a.state==='working')working++
        else if(a.state==='walking')walking++
        else if(a.state==='talking')talking++
      })
      setAnimCount({working,walking,talking})
    },1000)
    return ()=>clearInterval(t)
  },[])

  const p=LAYOUTS[layout]

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full overflow-hidden" style={{background:p.bg}}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{cursor:editMode?'crosshair':hoveredId?'pointer':'grab',imageRendering:'pixelated'}}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={()=>{panningRef.current=false;setHoverTile(null)}}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Layout selector — top left */}
      <div className="absolute top-4 left-4 flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1">
        {(Object.keys(LAYOUTS) as LayoutName[]).map(l=>(
          <button key={l} onClick={()=>setLayout(l)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              layout===l
                ? 'bg-white/15 text-white shadow-inner'
                : 'text-white/50 hover:text-white/80 hover:bg-white/8'
            }`}>
            <span>{LAYOUTS[l].emoji}</span>{LAYOUTS[l].label}
          </button>
        ))}
      </div>

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isAdmin&&(
          <button
            onClick={()=>{setEditMode(e=>!e);setHoverTile(null)}}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              editMode
                ?'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                :'bg-black/40 border-white/10 text-white/50 hover:text-white'
            }`}>
            <Grid3X3 className="w-3.5 h-3.5"/>
            {editMode?'Clique para mesa':'Editar mesas'}
          </button>
        )}
        <button
          onClick={()=>setShowSalaPanel(v=>!v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/40 border border-white/10 text-white/50 hover:text-white transition-colors">
          <Plus className="w-3.5 h-3.5"/>Salas
        </button>
      </div>

      {/* Sala panel */}
      {showSalaPanel&&(
        <div className="absolute top-14 right-4 z-30 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-300">Gerenciar Salas</span>
            <button onClick={()=>setAddSalaModal(true)} className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white">
              <Plus className="w-3.5 h-3.5"/>
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {salas.map((sala,i)=>(
              <div key={sala.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700">
                <span className="flex-1 text-xs text-white truncate">{sala.nome}</span>
                <div className="flex gap-0.5">
                  <button onClick={()=>moveSala(sala.id,-1)} disabled={i===0} className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronLeft className="w-3 h-3"/></button>
                  <button onClick={()=>moveSala(sala.id,1)} disabled={i===salas.length-1} className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronRight className="w-3 h-3"/></button>
                  <button onClick={()=>setEditSala(sala)} className="p-0.5 text-gray-600 hover:text-blue-400"><Pencil className="w-3 h-3"/></button>
                  <button onClick={()=>deleteSala(sala.id)} disabled={salas.length<=1} className="p-0.5 text-gray-600 hover:text-red-400 disabled:opacity-20"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-black/40 border border-white/10 rounded-xl p-1.5">
        <button onClick={()=>setZoom(z=>Math.min(2.5,z+0.15))} className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg text-lg font-bold">+</button>
        <button onClick={()=>setZoom(1)} className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-lg text-xs" title="Reset">{Math.round(zoom*100)}%</button>
        <button onClick={()=>setZoom(z=>Math.max(0.3,z-0.15))} className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg text-lg font-bold">−</button>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white/40">
        🏢 {agents.length} agente{agents.length!==1?'s':''}
        {animCount.working>0&&<span className="ml-2 text-yellow-400/70">⌨ {animCount.working} trabalhando</span>}
        {animCount.walking>0&&<span className="ml-2 text-blue-400/70">🚶 {animCount.walking} andando</span>}
        {animCount.talking>0&&<span className="ml-2 text-green-400/70">💬 {animCount.talking} conversando</span>}
      </div>

      {/* Tooltip */}
      {tooltip&&!editMode&&(
        <div className="fixed z-50 pointer-events-none" style={{left:tooltip.x+14,top:tooltip.y-10}}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl min-w-[140px]">
            <p className="text-sm font-semibold text-white">{tooltip.agent.nome}</p>
            {tooltip.agent.funcao&&<p className="text-xs text-gray-400 mt-0.5">{tooltip.agent.funcao}</p>}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-2 h-2 rounded-full" style={{backgroundColor:STATUS_COLOR[tooltip.agent.status]??'#6b7280'}}/>
              <span className="text-xs text-gray-500 capitalize">{tooltip.agent.status}</span>
              {tooltip.agent.tipo==='zeus'&&<span className="text-xs text-yellow-500 ml-1">👑 Mestre</span>}
            </div>
            <p className="text-xs text-gray-700 mt-1.5">Clique para abrir painel</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {agents.length===0&&(
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-gray-900/80 border border-gray-800 rounded-2xl p-8">
            <p className="text-4xl mb-3">🏢</p>
            <p className="text-gray-400 text-sm">O escritório está vazio.</p>
            <p className="text-gray-600 text-xs mt-1">Cadastre IAs em Configurações.</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {addSalaModal&&<SalaModal onSave={addSala} onClose={()=>setAddSalaModal(false)}/>}
      {editSala&&<SalaModal sala={editSala} onSave={d=>updateSala(editSala.id,d)} onClose={()=>setEditSala(null)}/>}
    </div>
  )
}

// ─── Speech bubble ────────────────────────────────────────────────────────────
function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number) {
  ctx.font='10px "Segoe UI",sans-serif'
  const words=text.split(' '), lines: string[]=[]
  let line=''
  for (const w of words) {
    const t=line?line+' '+w:w
    if (ctx.measureText(t).width>150) { if(line)lines.push(line); line=w } else line=t
  }
  if (line) lines.push(line)
  const shown=lines.slice(0,3), lineH=13
  const bw=Math.min(170,Math.max(...shown.map(l=>ctx.measureText(l).width))+18)
  const bh=shown.length*lineH+14
  const bx=cx-bw/2, by=cy-44-bh
  ctx.fillStyle='rgba(14,18,32,0.93)'
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,6); ctx.fill()
  ctx.strokeStyle='#4a9eff'; ctx.lineWidth=1.5
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,6); ctx.stroke()
  ctx.fillStyle='rgba(14,18,32,0.93)'
  ctx.beginPath(); ctx.moveTo(cx-5,by+bh); ctx.lineTo(cx+5,by+bh); ctx.lineTo(cx,by+bh+7); ctx.closePath(); ctx.fill()
  ctx.strokeStyle='#4a9eff'; ctx.lineWidth=1.5
  ctx.beginPath(); ctx.moveTo(cx-4,by+bh-1); ctx.lineTo(cx,by+bh+7); ctx.lineTo(cx+4,by+bh-1); ctx.stroke()
  ctx.fillStyle='#e8f0ff'; ctx.textAlign='left'; ctx.textBaseline='top'
  shown.forEach((l,i)=>ctx.fillText(l,bx+9,by+7+i*lineH))
}
