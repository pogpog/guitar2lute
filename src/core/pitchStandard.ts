import type { StorageLike } from './storage';

/** Which instrument a sound belongs to: each side has its own pitch standard. */
export type Side = 'lute' | 'guitar';

/** The standards offered in the drop-down, in Hz for A4. */
export const PITCH_PRESETS = [440, 415, 392] as const;
export const DEFAULT_A4 = 440;
export const MIN_A4 = 380;
export const MAX_A4 = 480;

export const pitchKey = (side: Side): string => `g2l:pitch:${side}`;

/**
 * A typed or stored standard: three digits with at most one decimal (a comma counts as the
 * decimal point, as some keyboards type it), between MIN_A4 and MAX_A4. Anything else is null.
 */
export function parseA4(text: string): number | null {
  const t = text.trim();
  if (!/^\d{3}([.,]\d)?$/.test(t)) return null;
  const v = Number(t.replace(',', '.'));
  return v >= MIN_A4 && v <= MAX_A4 ? v : null;
}

export const isPresetA4 = (a4: number): boolean => (PITCH_PRESETS as readonly number[]).includes(a4);

/** The side's stored standard, or the default when none is stored, it is invalid or storage fails. */
export function loadA4(storage: StorageLike, side: Side): number {
  try {
    return parseA4(storage.getItem(pitchKey(side)) ?? '') ?? DEFAULT_A4;
  } catch {
    return DEFAULT_A4;
  }
}

export function saveA4(storage: StorageLike, side: Side, a4: number): void {
  try {
    storage.setItem(pitchKey(side), String(a4));
  } catch {
    /* storage full or unavailable: the standard lasts for this session only */
  }
}
