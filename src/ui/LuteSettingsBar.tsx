import type { LuteSettings, Notation } from '../core/model';
import { LUTE_PRESETS, findPreset } from '../core/tunings';
import { clampInt } from './util';

export interface LuteSettingsBarProps {
  settings: LuteSettings;
  hasOverrides: boolean;
  onChange: (patch: Partial<LuteSettings>) => void;
  onEditTuning: () => void;
  onAuto: () => void;
  onClearOverrides: () => void;
}

export function LuteSettingsBar({ settings, hasOverrides, onChange, onEditTuning, onAuto, onClearOverrides }: LuteSettingsBarProps) {
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
      <label>
        Transpose
        <input
          type="number"
          data-testid="transpose"
          min={-12}
          max={12}
          value={settings.transpose}
          onChange={(e) => onChange({ transpose: clampInt(e.target.value, -12, 12) })}
        />
      </label>
      <button type="button" title="Keeps guitar shapes on a lute in G" onClick={() => onChange({ transpose: 3 })}>+3 guitar shapes</button>
      <button type="button" data-testid="auto-transpose" title="Pick the transpose that plays best" onClick={onAuto}>Auto</button>
      <label>
        Max fret
        <input type="number" min={4} max={12} value={settings.maxFret} onChange={(e) => onChange({ maxFret: clampInt(e.target.value, 4, 12) })} />
      </label>
      <label>
        Max stretch
        <input type="number" min={2} max={6} value={settings.maxStretch} onChange={(e) => onChange({ maxStretch: clampInt(e.target.value, 2, 6) })} />
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
