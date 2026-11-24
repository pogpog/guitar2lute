import type { LuteSettings, Notation } from '../core/model';
import { LUTE_PRESETS, findPreset } from '../core/tunings';
import { IntField } from './IntField';
import { PitchControl } from './PitchControl';

export interface LuteSettingsBarProps {
  settings: LuteSettings;
  hasOverrides: boolean;
  onChange: (patch: Partial<LuteSettings>) => void;
  onEditTuning: () => void;
  onAuto: () => void;
  /** Auto is still working out the best transpose */
  autoBusy?: boolean;
  onClearOverrides: () => void;
  /** the lute's pitch standard (A4 in Hz) */
  a4: number;
  onA4: (a4: number) => void;
  /** open or close the tuning aid */
  onTune: () => void;
}

export function LuteSettingsBar({ settings, hasOverrides, onChange, onEditTuning, onAuto, autoBusy = false, onClearOverrides, a4, onA4, onTune }: LuteSettingsBarProps) {
  const isPreset = LUTE_PRESETS.some((t) => t.id === settings.tuning.id);
  return (
    <div className="settings-bar" data-testid="lute-settings">
      <label>
        Lute tuning
        <select
          data-testid="lute-tuning"
          value={settings.tuning.id}
          onChange={(e) => {
            const t = findPreset(e.target.value);
            if (t) onChange({ tuning: t });
          }}
        >
          {LUTE_PRESETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          {!isPreset && <option value={settings.tuning.id}>{settings.tuning.name}</option>}
        </select>
      </label>
      <button type="button" onClick={onEditTuning}>Edit tuning…</button>
      <PitchControl a4={a4} onChange={onA4} testId="lute-pitch" />
      <button type="button" data-testid="open-tune" onClick={onTune}>Tune…</button>
      <label>
        Transpose
        <IntField data-testid="transpose" min={-12} max={12} value={settings.transpose} onCommit={(n) => onChange({ transpose: n })} />
      </label>
      <button type="button" title="Keeps guitar shapes on a lute in G" onClick={() => onChange({ transpose: 3 })}>+3 guitar shapes</button>
      <button type="button" data-testid="auto-transpose" title="Pick the transpose that plays best" disabled={autoBusy} aria-busy={autoBusy} onClick={onAuto}>
        {autoBusy ? 'Working…' : 'Auto'}
      </button>
      <label>
        Max fret
        <IntField data-testid="max-fret" min={4} max={12} value={settings.maxFret} onCommit={(n) => onChange({ maxFret: n })} />
      </label>
      <label>
        Max stretch
        <IntField data-testid="max-stretch" min={2} max={6} value={settings.maxStretch} onCommit={(n) => onChange({ maxStretch: n })} />
      </label>
      <label>
        Notation
        <select data-testid="notation" value={settings.notation} onChange={(e) => onChange({ notation: e.target.value as Notation })}>
          <option value="french">French (letters)</option>
          <option value="italian">Italian (numbers)</option>
          <option value="modern">Modern (numbers)</option>
        </select>
      </label>
      <button type="button" disabled={!hasOverrides} onClick={onClearOverrides}>Clear overrides</button>
    </div>
  );
}
