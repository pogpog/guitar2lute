import type { Tuning } from '../core/model';
import { courseLabels, type CourseLabel } from '../core/tunings';

export interface TuningLineProps {
  label: string;
  tuning: Tuning;
  testId: string;
}

const list = (cs: CourseLabel[]) => cs.map((c) => `${c.course} ${c.name}`).join(' · ');

/** The tuning spelled out course by course (1 = highest), with diapasons listed apart. */
export function TuningLine({ label, tuning, testId }: TuningLineProps) {
  const labels = courseLabels(tuning);
  const diapasons = labels.filter((c) => c.diapason);
  return (
    <p className="tuning-line" data-testid={testId}>
      <span className="tuning-line-label">{`${label}:`}</span>{' '}
      <span>{list(labels.filter((c) => !c.diapason))}</span>
      {diapasons.length > 0 && (
        <>
          {' '}
          <span className="diapasons"><span className="tuning-line-label">Diapasons:</span>{` ${list(diapasons)}`}</span>
        </>
      )}
    </p>
  );
}
