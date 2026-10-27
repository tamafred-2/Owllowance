import { expect, test as base } from '@playwright/test';

// The first-run guide is covered by its own test; elsewhere it is skipped whenever it appears.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(page.getByTestId('getting-started'), async () => {
      await page.getByRole('button', { name: 'Skip guide', exact: true }).click();
    });
    await use(page);
  },
});
export { expect };
export type { Page } from '@playwright/test';

// First run creates a Cash wallet at ₱0.00; optionally set what it starts with, then return Home.
export async function startWithCash(page: import('@playwright/test').Page, startingBalance?: string) {
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  if (!startingBalance) return;
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Manage Cash', exact: true }).click();
  await page.getByRole('button', { name: 'Edit starting balance', exact: true }).click();
  await page.getByLabel('Starting balance (PHP)', { exact: true }).fill(startingBalance);
  await page.getByRole('button', { name: 'Save starting balance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Starting balance', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to Wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}
