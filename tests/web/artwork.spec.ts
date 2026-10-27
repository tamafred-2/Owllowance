import { expect, test } from './fixtures';

test('ready data waits for the opening GIF to load and finish', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/owllowance-loading-loop.*.gif', async route => { await pending; await route.continue(); });
  await page.goto('/');
  await expect(page.getByTestId('opening-motion')).toBeVisible();
  await expect(page.getByTestId('opening-spinner')).toBeVisible();
  await expect(page.getByText('Start with one wallet.')).toHaveCount(0);
  const releasedAt = Date.now();
  release();
  await expect(page.getByText('Start with one wallet.')).toBeVisible();
  expect(Date.now() - releasedAt).toBeGreaterThanOrEqual(2350);
});

test('opening artwork follows real startup and reduced motion', async ({ page, context }, testInfo) => {
  await context.addInitScript(() => {
    const original = navigator.storage.getDirectory.bind(navigator.storage);
    const state = globalThis as typeof globalThis & { finishStartup?: () => void };
    const pending = new Promise<void>(resolve => { state.finishStartup = resolve; });
    navigator.storage.getDirectory = async () => { await pending; return original(); };
  });
  await page.goto('/');
  await expect(page.getByRole('progressbar', { name: 'Opening Owllowance' })).toBeVisible();
  await expect(page.getByTestId('opening-motion').locator('img')).toHaveAttribute('src', /owllowance-loading-loop.*\.gif/);
  await expect(page.getByTestId('opening-wordmark')).toHaveCount(0);
  await expect(page.getByTestId('opening-motion').locator('img')).toHaveJSProperty('complete', true);
  await page.screenshot({ path: testInfo.outputPath('opening-light.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('opening-still').locator('img')).toHaveAttribute('src', /logo-awake.*\.png/);
  await page.evaluate(() => { (globalThis as typeof globalThis & { finishStartup?: () => void }).finishStartup?.(); });
  await expect(page.getByText('Start with one wallet.')).toBeVisible();
  await expect(page.getByTestId('app-opening')).toHaveCount(0);
});

test('forest owl reacts, returns to idle, and stays static with reduced motion', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Choose local art time with a ticking clock so transitions can finish.
  await page.clock.install({ time: new Date('2026-10-15T10:00:00') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip — start with Cash at ₱0.00', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByTestId('forest-scene')).toBeVisible();
  await expect(page.getByTestId('forest-forenoon').locator('img')).toHaveJSProperty('complete', true);
  // The native image's intrinsic pixel size must not override the scene canvas.
  const sceneImage = page.getByTestId('forest-forenoon');
  const imageBox = await sceneImage.boundingBox();
  const sceneBox = await page.getByTestId('forest-scene').boundingBox();
  expect(imageBox!.width).toBeGreaterThanOrEqual(sceneBox!.width);
  expect(imageBox!.x).toBeLessThan(sceneBox!.x);
  const owl = page.getByRole('button', { name: 'Gently wake the owl', exact: true });
  let releaseReaction!: () => void;
  const delayedReaction = new Promise<void>(resolve => { releaseReaction = resolve; });
  await page.route('**/day-tap*.gif', async route => { await delayedReaction; await route.continue(); });
  await owl.click();
  await expect(page.getByTestId('owl-idle')).toBeVisible();
  releaseReaction();
  await expect(page.getByTestId('owl-reaction').locator('img')).toHaveAttribute('src', /day-tap.*\.gif/);
  await expect(page.getByTestId('owl-reaction')).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByTestId('owl-idle')).toBeVisible();
  await owl.blur();
  await page.screenshot({ path: testInfo.outputPath('forest-desktop-day.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setSystemTime(new Date('2026-10-15T22:00:00'));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  // Reopen to apply the new device clock immediately, as on a cold launch.
  await page.reload();
  await expect(page.getByTestId('forest-night')).toBeVisible();
  await expect(page.getByTestId('owl-idle').locator('img')).toHaveAttribute('src', /night-awake.*\.png/);
  const nightOwl = page.getByRole('button', { name: 'Greet the owl', exact: true });
  await nightOwl.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('owl-reaction').locator('img')).toHaveAttribute('src', /night-tap-poster.*\.png/);
  await expect(page.getByTestId('owl-idle')).toBeVisible();
  await expect(page.getByTestId('owl-reaction')).toHaveCount(0);
  await nightOwl.blur();
  await page.screenshot({ path: testInfo.outputPath('forest-mobile-night.png'), fullPage: true });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  expect(errors).toEqual([]);
});
