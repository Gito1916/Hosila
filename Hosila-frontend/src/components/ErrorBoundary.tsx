import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
                    <div className="max-w-md w-full text-center">
                        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle size={40} className="text-red-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-heading mb-3">
                            Something went wrong
                        </h1>
                        <p className="text-muted mb-6">
                            We're sorry, but something unexpected happened. Your data is safe.
                        </p>

                        {import.meta.env.DEV && this.state.error && (
                            <div className="bg-surface-card rounded-lg p-4 mb-6 text-left overflow-auto max-h-40">
                                <p className="text-sm text-red-400 font-mono break-all">
                                    {this.state.error.message}
                                </p>
                                {this.state.errorInfo && (
                                    <pre className="text-xs text-muted mt-2 whitespace-pre-wrap">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleGoHome}
                                className="btn btn-secondary flex items-center gap-2"
                            >
                                <Home size={18} />
                                Go Home
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="btn btn-primary flex items-center gap-2"
                            >
                                <RefreshCw size={18} />
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
