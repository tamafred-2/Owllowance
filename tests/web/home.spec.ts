import { expect, test } from './fixtures';

test('Home shows honest placeholders, daily cash flow and responsive navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Opening balance (PHP)', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await expect(page.getByTestId('forest-scene')).toBeVisible();
  const streak = page.getByTestId('floating-streak');
  const before = (await streak.boundingBox())!;
  expect(before.x).toBeGreaterThan(300);
  expect(before.y).toBeGreaterThan(450);
  const greeting = (await page.getByRole('heading', { name: 'Home', exact: true }).boundingBox())!;
  const notifications = (await page.getByRole('button', { name: 'Reminders', exact: true }).boundingBox())!;
  expect(Math.abs(greeting.y + greeting.height / 2 - notifications.y - notifications.height / 2)).toBeLessThan(2);
  await page.mouse.move(before.x + 24, before.y + 24);
  await page.mouse.down();
  await page.mouse.move(before.x - 76, before.y - 56, { steps: 10 });
  await page.mouse.up();
  const after = (await streak.boundingBox())!;
  expect(before.x - after.x).toBeGreaterThan(90);
  expect(before.y - after.y).toBeGreaterThan(70);
  await page.mouse.move(after.x + 24, after.y + 24);
  await page.mouse.down();
  await page.mouse.move(before.x + 24, before.y + 24, { steps: 10 });
  await page.mouse.up();
  const navigation = page.getByTestId('bottom-navigation');
  const add = navigation.getByRole('button', { name: 'Add transaction', exact: true });
  const barBox = (await navigation.boundingBox())!;
  const addBox = (await add.boundingBox())!;
  expect(addBox.width).toBeGreaterThanOrEqual(48);
  expect(addBox.height).toBeGreaterThanOrEqual(48);
  expect(Math.abs(addBox.x + addBox.width / 2 - (barBox.x + barBox.width / 2))).toBeLessThan(2);
  await expect(navigation.getByText('Add', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Total balance', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Recent activity', { exact: true })).toHaveCount(0);
  for (const label of ['Debt']) {
    await expect(page.getByRole('button', { name: `${label}, coming soon`, exact: true })).toBeDisabled();
  }
  for (const label of ['Settings', 'Transfer', 'Budgets', 'Insights', 'Goals']) {
    await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeEnabled();
  }
  await expect(page.getByTestId('today-net')).toContainText('₱0.00');
  await page.screenshot({ path: testInfo.outputPath('home-top-light.png'), fullPage: true });
  await page.getByText('Payments due', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('home-today-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByRole('tab', { name: 'Income', exact: true }).click();
  await page.getByLabel('Amount (PHP)', { exact: true }).fill('200');
  await page.getByRole('radio', { name: 'Allowance', exact: true }).click();
  await page.getByRole('button', { name: 'Save income', exact: true }).click();
  await expect(page.getByTestId('today-net')).toContainText('₱200.00');
  await expect(page.getByText('Net increase today', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByLabel('Amount (PHP)', { exact: true }).fill('300');
  await page.getByRole('radio', { name: 'Food & drink', exact: true }).click();
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByTestId('today-net')).toContainText('-₱100.00');
  await expect(page.getByText('Net decrease today', { exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('home-dark.png'), fullPage: true });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByText('Income / Allowance', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible();
  for (const route of ['Wallet', 'Plan', 'History']) {
    await page.getByRole('link', { name: route, exact: true }).click();
    await expect(page.getByRole('heading', { name: route, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${route.toLowerCase()}-header.png`), fullPage: true });
    await expect(page.getByRole('button', { name: 'Reminders', exact: true })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeEnabled();
  }
});
