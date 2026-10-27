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
