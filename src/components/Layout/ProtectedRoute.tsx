import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  children: ReactNode
  requireAdmin?:  boolean
  requireGestor?: boolean
}

export default function ProtectedRoute({ children, requireAdmin = false, requireGestor = false }: Props) {
  const { user, loading, isAdmin, isGestor } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (requireGestor && !isGestor) return <Navigate to="/dashboard" replace />

  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
