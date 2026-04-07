import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-center px-4">
      <p className="text-7xl font-bold text-gray-800 mb-4">404</p>
      <h1 className="text-xl font-semibold text-white mb-2">Página não encontrada</h1>
      <p className="text-sm text-gray-500 mb-8">Esta rota não existe no Escritório de IA.</p>
      <Link
        to="/dashboard"
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Home className="w-4 h-4" />
        Voltar ao início
      </Link>
    </div>
  )
}
