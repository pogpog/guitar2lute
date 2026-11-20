import type { Tuning } from '../core/model';
import { courseLabels, type CourseLabel } from '../core/tunings';

export interface TuningLineProps {
  label: string;
  tuning: Tuning;
  testId: string;
}

const list = (cs: CourseLabel[]) => cs.map((c) => `${c.course} ${c.name}`).join(' · ');

/**
 * The tuning spelled out from the lowest course to the highest (keeping the course numbers,
 * 1 = highest); any diapasons come first, labelled apart from the fretted courses.
 */
export function TuningLine({ label, tuning, testId }: TuningLineProps) {
  const labels = courseLabels(tuning).reverse();
  const diapasons = labels.filter((c) => c.diapason);
  const fretted = labels.filter((c) => !c.diapason);
  return (
    <p className="tuning-line" data-testid={testId}>
      <span className="tuning-line-label">{`${label}:`}</span>{' '}
      {diapasons.length > 0 ? (
        <>
          <span><span className="tuning-line-label">Diapasons:</span>{` ${list(diapasons)}`}</span>{' '}
          <span><span className="tuning-line-label">Fretted:</span>{` ${list(fretted)}`}</span>
        </>
      ) : (
        <span>{list(fretted)}</span>
      )}
    </p>
  );
}
