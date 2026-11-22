import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';
import { makeTextPdf } from './helpers/pdf';
import { TINY_SCORE, tinyMxl } from './helpers/mxl';

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
  await page.getByTestId('import-file').setInputFiles({
    name: 'tab.pdf',
    mimeType: 'application/pdf',
    buffer: makeTextPdf(['My Song', '', ...TAB]),
  });
  await expect(page.getByTestId('import-text')).toHaveValue(/e\|-------0---\|/);
  await page.getByTestId('do-import').click();
  await expect(page.getByTestId('guitar-tab')).toBeVisible();
});

test('opens a MusicXML .mxl', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('import-file').setInputFiles({ name: 'song.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: tinyMxl() });
  const box = page.getByTestId('import-text');
  await expect(box).toHaveValue(/^Tuning: D2 A2 D3 G3 B3 E4/);
  await expect(box).toHaveValue(/Capo: 3/);
  await expect(page.getByTestId('import-notices')).toHaveCount(0);
  await page.getByTestId('do-import').click();
  await expect(page.getByLabel('Capo')).toHaveValue('3');
  await expect(page.getByLabel('Guitar tuning')).toHaveValue('guitar-drop-d');
  await expect(page.getByTestId('guitar-tab')).toBeVisible();
});

test('re-opening import shows the generated tab', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('import-file').setInputFiles({ name: 'song.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: tinyMxl() });
  const box = page.getByTestId('import-text');
  await expect(box).toHaveValue(/Capo: 3/);
  const generated = await box.inputValue();
  await page.getByTestId('do-import').click();
  const tab = await page.getByTestId('guitar-tab').locator('pre').textContent();
  await page.getByTestId('open-import').click();
  await expect(page.getByTestId('import-text')).toHaveValue(generated);
  await page.getByTestId('do-import').click();
  await expect(page.getByTestId('guitar-tab').locator('pre')).toHaveText(tab!);
});

test('refuses a file over 100 MB and keeps the paste box', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('import-text').fill('keep me');
  // A sparse file: Playwright rejects in-memory buffers over 50 MB.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g2l-'));
  try {
    const big = path.join(dir, 'big.mp4');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, 100 * 1024 * 1024 + 1);
    await page.getByTestId('import-file').setInputFiles(big);
    await expect(page.getByRole('alert')).toHaveText('This file is too large to open (over 100 MB).');
    await expect(page.getByTestId('import-text')).toHaveValue('keep me');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a slow first file does not overwrite a file picked after it', async ({ page }) => {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  // Hold back the PDF reader's code so the first pick stays in flight.
  await page.route(/\/assets\/pdf-[^/]*\.js$/, async (route) => {
    await released;
    await route.continue();
  });
  await page.goto('/');
  await page.getByTestId('open-import').click();
  const input = page.getByTestId('import-file');
  await input.setInputFiles({ name: 'slow.pdf', mimeType: 'application/pdf', buffer: makeTextPdf(TAB) });
  await expect(page.getByText('Reading file…')).toBeVisible();
  await input.setInputFiles({ name: 'song.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: tinyMxl() });
  const box = page.getByTestId('import-text');
  await expect(box).toHaveValue(/Capo: 3/);
  const stale = page.waitForResponse(/\/assets\/pdf-[^/]*\.js$/);
  release();
  await stale;
  await expect(page.getByText('Reading file…')).toHaveCount(0);
  await expect(box).toHaveValue(/Capo: 3/);
  await expect(page.getByText('Reading file…')).toHaveCount(0);
});

test('a damaged .musicxml shows the damaged-file message', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('import-text').fill('keep me');
  await page.getByTestId('import-file').setInputFiles({
    name: 'broken.musicxml',
    mimeType: 'application/xml',
    buffer: Buffer.from(TINY_SCORE.slice(0, 400)),
  });
  await expect(page.getByRole('alert')).toContainText('Could not read this MusicXML file; it may be damaged.');
  await expect(page.getByTestId('import-text')).toHaveValue('keep me');
});

test('a .txt tab file lands in the paste box', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('import-file').setInputFiles({ name: 'tab.txt', mimeType: 'text/plain', buffer: Buffer.from(TAB.join('\n')) });
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

test('asks before importing a piece that already exists', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Piece title').fill('Greensleeves');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').selectOption('json')]);
  const backup = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c));
  const file = page.locator('input[type="file"][accept*="json"]');
  const importBackup = () => file.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  const asked: string[] = [];
  page.once('dialog', (d) => {
    asked.push(d.message());
    void d.dismiss();
  });
  await importBackup();
  await expect.poll(() => asked).toEqual(['“Greensleeves” already exists. Do you want to import it again?']);
  await expect(page.locator('.piece-open')).toHaveCount(1);
  page.once('dialog', (d) => void d.accept());
  await file.setInputFiles([]);
  await importBackup();
  await expect(page.locator('.piece-open', { hasText: 'Greensleeves (imported)' })).toHaveCount(1);
});

test('keeps import warnings after switching views and reloading', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  const withCountLine = ['Am        G', '|---1---2---|', 'e|---0---3---|', 'B|---1---0---|', 'G|---2---0---|', 'D|---2---0---|', 'A|---0---2---|', 'E|-------3---|', 'la la la'];
  await page.getByTestId('import-text').fill(withCountLine.join('\n'));
  await page.getByTestId('do-import').click();
  const items = page.getByTestId('warnings').locator('li');
  await expect(items).toHaveCount(1);
  const text = await items.allTextContents();
  expect(text[0]).toContain('Ignored line(s) 2');
  await page.getByTestId('view-lute').click();
  await page.getByTestId('view-guitar').click();
  await expect(items).toHaveText(text);
  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(items).toHaveText(text);
});

test('edits the guitar tuning string by string', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-chord').click();
  const box = page.getByTestId('guitar-chordbox').first();
  await box.getByTestId('open-5').click(); // low string open
  await expect(box.locator('figcaption')).toHaveText('E');

  await page.getByTestId('edit-guitar-tuning').click();
  const editor = page.getByTestId('guitar-tuning-editor');
  await editor.getByLabel('String 6 note').selectOption({ label: 'D' });
  await expect(page.getByLabel('Guitar tuning')).toHaveValue('guitar-drop-d');
  await expect(box.locator('figcaption')).toHaveText('D');

  await editor.getByLabel('String 5 note').selectOption({ label: 'G' });
  await expect(page.getByLabel('Guitar tuning')).toHaveValue('guitar-custom');
  await expect(page.getByLabel('Guitar tuning').locator('option:checked')).toHaveText('Custom (D G D G B E)');
  await editor.getByRole('button', { name: 'Done' }).click();
  await expect(editor).toHaveCount(0);

  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(page.getByLabel('Guitar tuning').locator('option:checked')).toHaveText('Custom (D G D G B E)');
});

test('spells out the lute and guitar tunings course by course', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('guitar-tuning-line')).toHaveText('Guitar tuning: 6 E2 · 5 A2 · 4 D3 · 3 G3 · 2 B3 · 1 E4');
  await page.getByLabel('Guitar tuning').selectOption('guitar-drop-d');
  await expect(page.getByTestId('guitar-tuning-line')).toContainText('6 D2 · 5 A2');

  await page.getByTestId('view-lute').click();
  const line = page.getByTestId('lute-tuning-line');
  await expect(line).toHaveText('Lute tuning: 6 G2 · 5 C3 · 4 F3 · 3 A3 · 2 D4 · 1 G4');
  await page.getByTestId('lute-tuning').selectOption('lute-8-g');
  await expect(line).toHaveText('Lute tuning: Diapasons: 8 D2 Fretted: 7 F2 · 6 G2 · 5 C3 · 4 F3 · 3 A3 · 2 D4 · 1 G4');
  await page.getByRole('button', { name: 'Edit tuning…' }).click();
  await page.getByLabel('Course 1 note').selectOption({ label: 'F' });
  await expect(line).toContainText('· 1 F4');
});

test('shows imported tab with the spacing it was written with', async ({ page }) => {
  const tab = [
    '|0-----------------------3-------|----5-3-2-----------------------|',
    '|0-----------3-1-0-------0-------|------------5---4---------------|',
    '|0---------------0---2-----------|5-------2-----------------------|',
    '|--------2---4-------------------|5---------------4---------------|',
    '|--------------------------------|3---------------2---------------|',
    '|0---------------0---------------|--------------------------------|',
  ];
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('import-text').fill(tab.join('\n'));
  await page.getByTestId('do-import').click();
  const labels = ['e', 'B', 'G', 'D', 'A', 'E'];
  await expect(page.getByTestId('guitar-tab').locator('pre')).toHaveText(tab.map((l, s) => labels[s] + l).join('\n'));
});
