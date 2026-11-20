import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/ui/App';

describe('App scaffold', () => {
  it('renders the app title', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Guitar → Lute');
  });
});
