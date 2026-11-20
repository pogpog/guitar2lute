import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { WarningsPanel } from '../../src/ui/WarningsPanel';
import { PieceList } from '../../src/ui/PieceList';
import { Header } from '../../src/ui/Header';

describe('WarningsPanel', () => {
  it('renders nothing without warnings', () => {
    expect(html(<WarningsPanel warnings={[]} />)).toBe('');
  });
  it('lists warnings with line links', () => {
    const out = html(<WarningsPanel warnings={[{ kind: 'parse', message: 'Bad line', line: 3 }]} onSelect={noop} />);
    expect(out).toContain('1 warning');
    expect(out).toContain('Line 3: Bad line');
  });
});

describe('PieceList', () => {
  it('lists pieces and marks the current one', () => {
    const out = html(
      <PieceList
        list={[{ id: 'a', title: 'Alpha', updatedAt: '2026-11-19T10:00:00Z' }, { id: 'b', title: '', updatedAt: '2026-11-19T10:00:00Z' }]}
        currentId="a" open={false} onOpen={noop} onNew={noop} onDelete={noop}
      />,
    );
    expect(out).toContain('Alpha');
    expect(out).toContain('Untitled');
    expect(out).toContain('class="current"');
    expect(out).toContain('data-testid="new-piece"');
  });
});

describe('Header', () => {
  it('shows brand, title, view toggle and export menu', () => {
    const out = html(
      <Header title="My piece" onTitle={noop} view="guitar" onView={noop} playing={false} onPlay={noop} onStop={noop}
        msPerUnit={120} onTempo={noop} onExport={noop} onImportJson={noop} onToggleSidebar={noop} />,
    );
    expect(out).toContain('Guitar → Lute');
    expect(out).toContain('value="My piece"');
    expect(out).toMatch(/data-testid="view-guitar"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-testid="view-guitar"/);
    expect(out).toContain('Lute TabCode (.tc)');
    expect(out).toContain('data-testid="play"');
  });
});
