'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for browser DevTools
    console.error(`[ErrorBoundary${this.props.name ? `/${this.props.name}` : ''}]`, error.message, error.stack);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Log to server via fetch (so we can see it in container logs)
    const msg = `[ErrorBoundary${this.props.name ? `/${this.props.name}` : ''}] ${error.message}\nStack: ${error.stack}\nComponent: ${errorInfo.componentStack}`;
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        name: this.props.name,
      }),
    }).catch(() => {}); // Don't fail if logging fails
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="bg-red-950/50 border-2 border-red-800/40 rounded-lg p-4 m-2">
          <p className="text-red-400 font-bold text-sm mb-1">
            ⚠️ Component error{this.props.name ? `: ${this.props.name}` : ''}
          </p>
          <p className="text-red-300/70 text-xs">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
