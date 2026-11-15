import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    // Do not wipe saved settings; fail gracefully
  }

  handleReload = () => {
    this.setState({ hasError: false });
    try {
      window.location.reload();
    } catch {
      // Ignore reload failure
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          onClick={this.handleReload}
          className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none"
        >
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-4">
            <h1 className="text-xl font-bold text-white">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your saved presets and clock settings are safe. Tap anywhere to reload ChronoMate.
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                this.handleReload();
              }}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm transition-colors"
            >
              Tap to Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
