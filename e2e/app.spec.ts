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

test('keeps an edit made just before the page closes', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Piece title').fill('Last second');
  await page.reload();
  await expect(page.getByLabel('Piece title')).toHaveValue('Last second');
});

test('explains why a saved piece cannot be opened', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const future = { schemaVersion: 99, id: 'future', title: 'From the future', updatedAt: '2030-01-01T00:00:00.000Z' };
    localStorage.setItem('g2l:piece:future', JSON.stringify(future));
    localStorage.setItem('g2l:index', JSON.stringify([{ id: 'future', title: 'From the future', updatedAt: future.updatedAt }]));
  });
  await page.goto('/');
  await page.getByText('From the future').click();
  await expect(page.getByRole('alert')).toContainText('newer version');
});

test('offers PNG icons Android needs to install the app', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find((i: { sizes: string; type: string }) => i.sizes === size && i.type === 'image/png');
    expect(icon, size).toBeTruthy();
    const res = await request.get(icon.src);
    expect(res.status(), size).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
});

test('removes manual placements that no longer fit after a tuning change', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-chord').click();
  const box = page.getByTestId('guitar-chordbox').first();
  for (const id of ['open-0', 'cell-1-1', 'cell-2-2', 'cell-3-2', 'open-4', 'open-5', 'open-5']) await box.getByTestId(id).click(); // Am
  await page.getByTestId('view-lute').click();
  await page.getByTestId('lute-chordbox').first().locator('[data-testid^="lute-note-"]').first().click();
  await expect(page.getByTestId('lute-chordbox').first().locator('.pinned').first()).toBeVisible();
  await page.getByTestId('lute-tuning').selectOption('lute-13-baroque-dm');
  const stale = page.locator('.warning-pin');
  await expect(stale).toHaveCount(1);
  await stale.getByRole('button', { name: 'Remove' }).click();
  await expect(stale).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear overrides' })).toBeDisabled();
});

test('does not fill the piece list with empty untitled pieces', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-piece').click();
  await page.getByTestId('new-piece').click();
  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(page.locator('.piece-open')).toHaveCount(0);
});

test('importing an old backup never overwrites the edited piece', async ({ page }) => {
  await page.goto('/');
  const title = page.getByLabel('Piece title');
  await title.fill('Greensleeves');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').selectOption('json')]);
  const backup = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c));
  await title.fill('Greensleeves edited');
  // import straight away, before the autosave debounce has run
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await expect(title).toHaveValue('Greensleeves (imported)');
  await expect(page.locator('.piece-open', { hasText: 'Greensleeves edited' })).toHaveCount(1);
  await expect(page.locator('.piece-open', { hasText: 'Greensleeves (imported)' })).toHaveCount(1);
});
