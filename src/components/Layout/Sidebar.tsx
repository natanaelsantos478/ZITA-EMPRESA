import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '◻' },
  { to: '/organograma', label: 'Organograma', icon: '⬡' },
  { to: '/configuracoes', label: 'Configurações', icon: '⚙' },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-dark-800 border-r border-dark-500">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-dark-500">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏢</span>
          <div>
            <p className="font-bold text-white text-sm leading-tight">ZITA</p>
            <p className="text-xs text-gray-500">Escritório de IA</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-dark-700'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-dark-500">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-medium text-white truncate">
            {profile?.display_name ?? profile?.email ?? 'Usuário'}
          </p>
          <p className="text-xs text-gray-500 capitalize">{profile?.role ?? 'member'}</p>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <span>↩</span>
          Sair
        </button>
      </div>
    </aside>
  )
}
