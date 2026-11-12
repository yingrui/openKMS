import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n/config';

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
        <div className="openkms-error-boundary">
          <h2 className="openkms-error-boundary__title">
            {i18n.t('errors.somethingWrong', { ns: 'common' })}
          </h2>
          <pre className="openkms-error-boundary__pre">{this.state.error.message}</pre>
          <button type="button" className="openkms-error-boundary__retry" onClick={this.handleRetry}>
            {i18n.t('errors.tryAgain', { ns: 'common' })}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
