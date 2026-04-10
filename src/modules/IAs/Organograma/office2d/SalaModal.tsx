import { useState } from 'react'
import { THEMES, DEFAULT_DESKS_16, DEFAULT_DESKS_22 } from './types'
import type { SalaConfig, ThemeName } from './types'

interface Props {
  sala?: SalaConfig
  onSave: (data: Omit<SalaConfig, 'id'>) => void
  onClose: () => void
}

export function SalaModal({ sala, onSave, onClose }: Props) {
  const [nome,  setNome]  = useState(sala?.nome  ?? '')
  const [theme, setTheme] = useState<ThemeName>(sala?.theme ?? 'moderno')
  const [cols,  setCols]  = useState(sala?.cols  ?? 16)

  const save = () => {
    if (!nome.trim()) return
    const desks = cols >= 22 ? DEFAULT_DESKS_22 : DEFAULT_DESKS_16
    onSave({ nome, theme, cols, desks: sala?.desks ?? desks })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-semibold mb-4">{sala ? 'Editar sala' : 'Nova sala'}</h3>

        <label className="block text-xs text-gray-400 mb-1">Nome</label>
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-4 outline-none focus:border-brand-500" />

        <label className="block text-xs text-gray-400 mb-2">Tema</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(Object.keys(THEMES) as ThemeName[]).map(k => (
            <button key={k} onClick={() => setTheme(k)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                theme === k ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              <span>{THEMES[k].emoji}</span>{THEMES[k].label}
            </button>
          ))}
        </div>

        <label className="block text-xs text-gray-400 mb-2">Largura (tiles)</label>
        <div className="flex gap-2 mb-5">
          {[12, 16, 22, 28].map(c => (
            <button key={c} onClick={() => setCols(c)}
              className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                cols === c ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}>{c}</button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">Cancelar</button>
          <button onClick={save} disabled={!nome.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  )
}
