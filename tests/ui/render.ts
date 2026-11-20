import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Static markup with React's text-node separators removed, so text assertions read naturally. */
export const html = (el: ReactElement): string => renderToStaticMarkup(el).replace(/<!-- -->/g, '');
export const noop = () => {};
