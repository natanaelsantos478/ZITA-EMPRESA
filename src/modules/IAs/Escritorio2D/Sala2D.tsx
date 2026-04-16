interface SalaConfig {
  id: string
  nome: string
  cor: string
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  sala: SalaConfig
  children?: React.ReactNode
  onDragStart?: (e: React.MouseEvent, salaId: string) => void
  onResize?: (salaId: string, dw: number, dh: number) => void
  isAdmin?: boolean
}

export type { SalaConfig }

export default function Sala2D({ sala, children, onDragStart, isAdmin }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: sala.x,
        top: sala.y,
        width: sala.w,
        height: sala.h,
        backgroundColor: '#1c2033',
        border: '1px solid #363d5c',
        borderRadius: '4px',
        // Grid de alinhamento sutil — não pixel art, apenas guias
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.03)',
      }}
    >
      {/* Label row — drag handle para admins */}
      <div
        style={{
          borderBottom: '1px solid #363d5c',
          cursor: isAdmin ? 'move' : 'default',
          height: '28px',
        }}
        className="flex items-center gap-1.5 px-2.5 select-none"
        onMouseDown={
          isAdmin
            ? (e) => { e.stopPropagation(); onDragStart?.(e, sala.id) }
            : undefined
        }
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: sala.cor }}
        />
        <span
          className="text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: '#6b7280', letterSpacing: '0.08em' }}
        >
          {sala.nome}
        </span>
      </div>

      {/* Área de conteúdo — position: relative para agentes e móveis absolutos */}
      <div
        className="relative"
        style={{ width: '100%', height: 'calc(100% - 28px)' }}
      >
        {children}
      </div>
    </div>
  )
}
