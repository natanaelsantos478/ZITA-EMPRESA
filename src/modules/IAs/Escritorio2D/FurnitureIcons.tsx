// ─── Ícones SVG flat de móveis — sem texturas, design profissional ────────────

export function DeskIcon() {
  return (
    <svg width="52" height="32" viewBox="0 0 52 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Tampo da mesa */}
      <rect x="0" y="5" width="52" height="16" rx="2" fill="#23283d" stroke="#3a4060" strokeWidth="1" />
      {/* Pé esquerdo */}
      <rect x="4" y="21" width="5" height="9" rx="1" fill="#1a1e2e" stroke="#2d3142" strokeWidth="0.8" />
      {/* Pé direito */}
      <rect x="43" y="21" width="5" height="9" rx="1" fill="#1a1e2e" stroke="#2d3142" strokeWidth="0.8" />
      {/* Monitor */}
      <rect x="15" y="0" width="22" height="14" rx="1.5" fill="#0f1117" stroke="#4e5eff" strokeWidth="0.8" opacity="0.7" />
      {/* Tela do monitor */}
      <rect x="17" y="2" width="18" height="9" rx="1" fill="#1a2040" opacity="0.8" />
      {/* Brilho do monitor */}
      <line x1="17" y1="3" x2="22" y2="3" stroke="#6b7fff" strokeWidth="0.5" opacity="0.5" />
    </svg>
  )
}

export function ChairIcon({ rotation = 0 }: { rotation?: number }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: `rotate(${rotation}deg)`, display: 'block' }}
    >
      {/* Encosto */}
      <rect x="4" y="2" width="16" height="7" rx="2.5" fill="#252a3d" stroke="#3a4060" strokeWidth="1" />
      {/* Assento */}
      <rect x="3" y="8" width="18" height="13" rx="3" fill="#1e2235" stroke="#3a4060" strokeWidth="1" />
      {/* Detalhe do assento */}
      <rect x="6" y="11" width="12" height="6" rx="1.5" fill="#23283d" opacity="0.6" />
    </svg>
  )
}

export function WcIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" fill="#1a1e2e" stroke="#3a4060" strokeWidth="1" />
      <text x="10" y="14" textAnchor="middle" fontSize="10" fill="#6b7280">🚻</text>
    </svg>
  )
}
