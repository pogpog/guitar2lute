import { describe, it, expect } from 'vitest';
import { html } from './render';
import { App } from '../../src/ui/App';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary';
import { MemoryStorage, PieceStore } from '../../src/core/storage';
import { newPiece } from '../../src/core/piece';

describe('ErrorBoundary', () => {
  it('shows a recovery screen instead of a blank page', () => {
    // Server rendering does not run error boundaries, so drive the component directly.
    const b = new ErrorBoundary({ children: null });
    b.state = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    const out = html(<>{b.render()}</>);
    expect(out).toContain('Something went wrong');
    expect(out).toContain('boom');
    expect(out).toContain('Download saved data');
  });
});

describe('App', () => {
  it('starts with a new untitled piece in the guitar view', () => {
    const out = html(<App storage={new MemoryStorage()} />);
    expect(out).toContain('Guitar → Lute');
    expect(out).toContain('value="Untitled"');
    expect(out).toContain('data-testid="add-chord"');
  });
  it('opens the most recent saved piece', () => {
    const s = new MemoryStorage();
    new PieceStore(s).save(newPiece('Greensleeves'));
    expect(html(<App storage={s} />)).toContain('value="Greensleeves"');
  });
});
