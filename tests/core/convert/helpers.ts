import { findPreset } from '../../../src/core/tunings';
import type { Limits } from '../../../src/core/convert/types';

export function limits(id = 'lute-6-g', maxFret = 8, maxStretch = 4): Limits {
  return { tuning: findPreset(id)!, maxFret, maxStretch };
}
