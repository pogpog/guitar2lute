import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { TunePanel, tuneButtonText } from '../../src/ui/TunePanel';
import { PitchControl, commitOther } from '../../src/ui/PitchControl';
import { findPreset, STANDARD_GUITAR, tuneGroups } from '../../src/core/tunings';

const tuner = { play: noop, stop: noop };

describe('tuneButtonText', () => {
  it('shows course, name and Hz at the standard', () => {
    const six = tuneGroups(findPreset('lute-6-g')!, 'lute')[0].courses[5];
    expect(tuneButtonText(six, 440)).toBe('6 G2 · 98.0 Hz');
    expect(tuneButtonText(six, 415)).toBe('6 G2 · 92.4 Hz');
  });
});

describe('TunePanel', () => {
  it('labels the lute groups above their buttons, nothing lit', () => {
    const out = html(<TunePanel tuning={findPreset('lute-8-g')!} a4={440} instrument="lute" tuner={tuner} onClose={noop} />);
    expect(out).toContain('data-testid="tune-panel"');
    expect(out.indexOf('Fretted')).toBeLessThan(out.indexOf('tune-course-1'));
    expect(out.indexOf('Diapasons')).toBeGreaterThan(out.indexOf('tune-course-7'));
    expect(out.indexOf('Diapasons')).toBeLessThan(out.indexOf('tune-course-8'));
    expect(out.match(/class="tune-course"/g)).toHaveLength(8);
    expect(out).toContain('6 G2 · 98.0 Hz');
    expect(out).not.toContain('aria-pressed="true"');
    expect(out).toContain('data-testid="tune-close"');
  });
  it('shows the guitar strings as one group', () => {
    const out = html(<TunePanel tuning={STANDARD_GUITAR} a4={440} instrument="guitar" tuner={tuner} onClose={noop} />);
    expect(out).toContain('Strings');
    expect(out).not.toContain('Fretted');
    expect(out.match(/class="tune-course"/g)).toHaveLength(6);
  });
});

describe('PitchControl', () => {
  it('selects a preset and hides the box', () => {
    const out = html(<PitchControl a4={415} onChange={noop} testId="lute-pitch" />);
    expect(out).toContain('Pitch');
    expect(out).toMatch(/<option value="415" selected="">A = 415<\/option>/);
    expect(out).toContain('Other…');
    expect(out).not.toContain('lute-pitch-other');
  });
  it('shows a typed standard as Other… with its value', () => {
    const out = html(<PitchControl a4={430} onChange={noop} testId="lute-pitch" />);
    expect(out).toMatch(/<option value="other" selected="">Other…<\/option>/);
    expect(out).toMatch(/data-testid="lute-pitch-other"[^>]*value="430"|value="430"[^>]*data-testid="lute-pitch-other"/);
  });
  it('keeps the current standard for an empty or invalid entry', () => {
    expect(commitOther('415,3', 440)).toBe(415.3);
    expect(commitOther('', 415)).toBe(415);
    expect(commitOther('500', 392)).toBe(392);
  });
});
