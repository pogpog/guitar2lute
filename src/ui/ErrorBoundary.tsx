import { Component, type ReactNode } from 'react';
import { downloadText } from './util';

interface State { error: Error | null; }

/** Last-resort screen: a bug never leaves a blank page, and saved pieces can always be downloaded. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private exportRaw = () => {
    const data: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('g2l:')) data[k] = localStorage.getItem(k) ?? '';
      }
    } catch {
      // storage unavailable: download what we have (nothing)
    }
    downloadText('guitar2lute-saved-data.json', JSON.stringify(data, null, 2), 'application/json');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>{this.state.error.message}</p>
        <p>Your saved pieces are still in this browser. Download a copy before reloading.</p>
        <button type="button" onClick={this.exportRaw}>Download saved data</button>{' '}
        <button type="button" onClick={() => location.reload()}>Reload</button>
      </main>
    );
  }
}
