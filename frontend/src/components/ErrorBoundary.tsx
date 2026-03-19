import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Something went wrong</h2>
          <pre style={{
            maxWidth: '100%',
            overflow: 'auto',
            padding: '1rem',
            background: 'var(--bg-secondary, #f5f5f5)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            marginBottom: '1rem',
          }}>
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              background: 'var(--accent, #2563eb)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
