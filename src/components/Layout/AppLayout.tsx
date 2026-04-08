import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  LayoutDashboard, Network, Settings, LogOut, Brain,
  Bell, ChevronLeft, ChevronRight, User
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/organograma', label: 'Organograma', icon: Network },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, adminOnly: true },
]

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-800 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-white leading-tight">Escritório de IA</p>
              <p className="text-xs text-gray-500">ZITA</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, adminOnly }) => {
            if (adminOnly && !isAdmin) return null
            const active = location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                } ${collapsed ? 'justify-center' : ''}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User */}
        <div className={`border-t border-gray-800 p-2 space-y-1`}>
          <div className={`flex items-center gap-2 px-2 py-2 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-brand-300" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{profile?.nome ?? 'Usuário'}</p>
                <p className="text-xs text-gray-500 truncate capitalize">{profile?.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            title="Sair"
            className={`flex items-center gap-2 w-full px-2 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute left-0 bottom-32 translate-x-full -translate-y-1/2 bg-gray-800 border border-gray-700 rounded-r-md p-1 text-gray-400 hover:text-white transition-colors"
          style={{ position: 'absolute', left: collapsed ? '3.5rem' : '13rem', bottom: '7rem' }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
          <div />
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full" />
            </button>
            <div className="text-sm text-gray-400">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  )
}
