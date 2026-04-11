import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import AppLayout from './components/Layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Organograma from './pages/Organograma'
import Configuracoes from './pages/Configuracoes'
import Gestor from './pages/Gestor'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/organograma"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Organograma />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/configuracoes"
            element={
              <ProtectedRoute requireAdmin>
                <AppLayout>
                  <Configuracoes />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/configuracoes/ias"
            element={
              <ProtectedRoute requireAdmin>
                <AppLayout>
                  <Configuracoes />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Gestor — acesso exclusivo para role 'gestor' */}
          <Route
            path="/gestor"
            element={
              <ProtectedRoute requireGestor>
                <Gestor />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
