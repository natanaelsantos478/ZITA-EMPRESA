import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4">
      <span className="text-6xl">🤖</span>
      <h1 className="text-4xl font-bold text-white">404</h1>
      <p className="text-gray-400">Página não encontrada.</p>
      <button onClick={() => navigate('/dashboard')} className="btn-primary mt-2">
        Voltar ao Dashboard
      </button>
    </div>
  )
}
