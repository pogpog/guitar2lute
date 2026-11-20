import { test, expect } from '@playwright/test';
import { makeTextPdf } from './helpers/pdf';

const TAB = [
  'e|-------0---|',
  'B|-----1---1-|',
  'G|---2-------|',
  'D|-----------|',
  'A|-0---------|',
  'E|-----------|',
];

test('enter a chord, import tab, convert to lute and override a note', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-chord').click();
  const box = page.getByTestId('guitar-chordbox').first();
  await box.getByTestId('open-0').click(); // high e open
  await box.getByTestId('cell-1-1').click(); // B fret 1
  await box.getByTestId('cell-2-2').click(); // G fret 2
  await box.getByTestId('cell-3-2').click(); // D fret 2
  await box.getByTestId('open-4').click(); // A open
  await box.getByTestId('open-5').click(); // low E open...
  await box.getByTestId('open-5').click(); // ...then muted
  await expect(box.locator('figcaption')).toHaveText('A E A C E');
  await expect(box.getByLabel('Chord name')).toHaveAttribute('placeholder', 'Am');

  await page.getByTestId('open-import').click();
  await page.getByTestId('import-text').fill(TAB.join('\n'));
  await page.getByTestId('do-import').click();
  await expect(page.getByTestId('guitar-tab')).toContainText('e|');

  await page.getByTestId('view-lute').click();
  await expect(page.getByTestId('lute-chordbox')).toHaveCount(1);
  await expect(page.getByTestId('lute-tab')).toBeVisible();
  await page.getByTestId('notation').selectOption('italian');
  await expect(page.getByTestId('glyph-0-0')).toBeVisible();
  await page.getByTestId('glyph-0-0').click();
  await expect(page.getByTestId('glyph-0-0')).toHaveClass(/pinned/);

  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(page.getByTestId('guitar-chordbox')).toHaveCount(1);
});

test('imports a text-based PDF', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('pdf-input').setInputFiles({
    name: 'tab.pdf',
    mimeType: 'application/pdf',
    buffer: makeTextPdf(['My Song', '', ...TAB]),
  });
  await expect(page.getByTestId('import-text')).toHaveValue(/e\|-------0---\|/);
  await page.getByTestId('do-import').click();
  await expect(page.getByTestId('guitar-tab')).toBeVisible();
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Guitar → Lute')).toBeVisible();
  await expect(page.getByTestId('add-chord')).toBeVisible();
});

test('number fields can be typed digit by digit', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('view-lute').click();
  const transpose = page.getByTestId('transpose');
  await transpose.selectText();
  await transpose.press('Backspace');
  await transpose.pressSequentially('-3');
  await transpose.blur();
  await expect(transpose).toHaveValue('-3');
  const maxFret = page.getByTestId('max-fret');
  await maxFret.selectText();
  await maxFret.pressSequentially('10');
  await maxFret.blur();
  await expect(maxFret).toHaveValue('10');
});
