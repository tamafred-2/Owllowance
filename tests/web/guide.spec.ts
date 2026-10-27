import { expect, test } from '@playwright/test';

// Uses plain Playwright: the shared fixture skips the guide everywhere else.
test('first-run guide walks through the main features once and reopens from Settings', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  const guide = page.getByTestId('getting-started');
  await expect(guide).toBeVisible();
  await expect(guide.getByText('Welcome to Owllowance', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('guide-1.png') });
  for (let step = 2; step <= 5; step++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // The card for this step has slid fully into view.
    await expect.poll(async () => (await guide.getByText(`STEP ${step} OF 5`, { exact: true }).boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await guide.getByText(`STEP ${step} OF 5`, { exact: true }).boundingBox())?.x ?? 999).toBeLessThan(100);
  }
  await page.screenshot({ path: testInfo.outputPath('guide-5.png') });
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await expect(guide).toHaveCount(0);
  await page.waitForTimeout(600); // Let the "guide seen" setting finish saving before reloading.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(guide).toHaveCount(0); // Shown once.
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'How to use Owllowance', exact: true }).click();
  await expect(guide).toBeVisible();
  await page.getByRole('button', { name: 'Skip guide', exact: true }).click();
  await expect(guide).toHaveCount(0);
});
