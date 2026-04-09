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
        borderColor: sala.cor + '99',
        backgroundColor: sala.cor + '11',
      }}
      className="border-2 rounded-2xl"
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 rounded-t-xl cursor-move select-none"
        style={{ backgroundColor: sala.cor + '22', borderBottom: `1px solid ${sala.cor}44` }}
        onMouseDown={isAdmin ? (e) => { e.stopPropagation(); onDragStart?.(e, sala.id) } : undefined}
      >
        <span className="text-xs font-semibold" style={{ color: sala.cor }}>
          {sala.nome}
        </span>
      </div>

      {/* Content area — characters drop here */}
      <div className="p-4 flex flex-wrap gap-4 items-end content-start">
        {children}
      </div>
    </div>
  )
}
