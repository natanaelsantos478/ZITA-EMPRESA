import { useState } from 'react'
import { LayoutTemplate, Building2, Box } from 'lucide-react'
import CanvasView from '../modules/IAs/Organograma/CanvasView'
import Escritorio2D from '../modules/IAs/Escritorio2D/Escritorio2D'
import Escritorio3D from '../modules/IAs/Escritorio3D/Escritorio3D'

type ViewMode = 'canvas' | '2d' | '3d'

export default function Organograma() {
  const [view, setView] = useState<ViewMode>('canvas')

  return (
    <div className="relative w-full h-[calc(100vh-56px)] overflow-hidden bg-gray-950">
      {/* View toggle — top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 shadow-lg">
        <button
          onClick={() => setView('canvas')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === 'canvas'
              ? 'bg-brand-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <LayoutTemplate className="w-3.5 h-3.5" />
          Canvas
        </button>
        <button
          onClick={() => setView('2d')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === '2d'
              ? 'bg-brand-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          2D
        </button>
        <button
          onClick={() => setView('3d')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === '3d'
              ? 'bg-brand-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          3D
        </button>
      </div>

      {/* Views */}
      {view === 'canvas' && <CanvasView />}
      {view === '2d'     && <Escritorio2D />}
      {view === '3d'     && <Escritorio3D />}
    </div>
  )
}
