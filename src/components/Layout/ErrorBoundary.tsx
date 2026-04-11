import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm font-semibold text-red-400">Erro ao renderizar esta área</p>
          <p className="text-xs text-gray-500 max-w-xs font-mono break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
