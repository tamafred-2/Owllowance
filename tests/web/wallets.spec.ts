import { expect, test } from '@playwright/test';

test('Accounts creates wallets, selects expense account and preserves totals after reload', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Opening balance (PHP)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByTestId('forest-scene')).toBeVisible();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Add wallet', exact: true }).click();
  await page.getByLabel('Wallet name', { exact: true }).fill('Test bank');
  await page.getByRole('radio', { name: 'Bank', exact: true }).click();
  await page.getByLabel('Opening balance (PHP)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await expect(page.getByText('Test bank', { exact: true })).toBeVisible();
  await expect(page.getByText('₱300.00', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add transaction', exact: true }).click();
  await page.getByLabel('Amount (PHP)', { exact: true }).fill('20');
  await page.getByRole('radio', { name: 'Food & drink', exact: true }).click();
  await page.getByRole('radio', { name: 'Wallet: Test bank', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('expense-redesign-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByTestId('today-net')).toContainText('-₱20.00');
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await page.reload();
  await expect(page.getByText('₱100.00', { exact: true })).toBeVisible();
  await expect(page.getByText('₱180.00', { exact: true })).toBeVisible();
  await expect(page.getByText('₱280.00', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('accounts-mobile.png'), fullPage: true });
});

test('wallet rename, archive cancellation, all-archived recovery and restore preserve money', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Opening balance (PHP)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Manage Cash', exact: true }).click();
  await page.getByLabel('Wallet name', { exact: true }).fill('Everyday');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.getByRole('link', { name: 'Manage Everyday', exact: true }).click();
  await page.getByRole('button', { name: 'Archive wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm archive', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive wallet', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('archive-confirmation.png'), fullPage: true });
  await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await expect(page.getByText('Archived wallets', { exact: true })).toBeVisible();
  await expect(page.getByText('Start with one wallet.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add transaction', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByText('Payments due', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Archived wallets', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('archived-wallet.png'), fullPage: true });
  await page.getByRole('link', { name: 'Manage Everyday', exact: true }).click();
  await page.getByRole('button', { name: 'Restore wallet', exact: true }).click();
  await expect(page.getByText('Archived wallets', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Wallet: Everyday', exact: true })).toBeVisible();
});


test('provider presets keep editable wallet names and use existing wallet kinds', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  for (const [provider, kind] of [['GCash', 'E-wallet'], ['Maya', 'E-wallet'], ['BPI', 'Bank'], ['MariBank', 'Bank'], ['GoTyme', 'Bank']]) {
    await page.getByRole('link', { name: 'Add wallet', exact: true }).click();
    await page.getByRole('radio', { name: kind, exact: true }).click();
    await page.getByRole('button', { name: `Use ${provider} preset`, exact: true }).click();
    await expect(page.getByLabel('Wallet name', { exact: true })).toHaveValue(provider);
    await expect(page.getByRole('radio', { name: kind, exact: true })).toHaveAttribute('aria-checked', 'true');
    if (provider === 'GoTyme') {
      await expect(page.getByRole('button', { name: 'Use GCash preset', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('bank-provider-form.png'), fullPage: true });
    }
    await page.getByLabel('Opening balance (PHP)', { exact: true }).fill('500');
    await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
    await expect(page.getByRole('link', { name: `Manage ${provider}`, exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByText('Bank accounts', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('provider-cards-mobile.png'), fullPage: true });
  await page.getByRole('link', { name: 'Manage BPI', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('provider-cards-lower.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('provider-cards-dark.png'), fullPage: true });
});


test('duplicate provider wallets stay distinct and forms hide mobile navigation', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  for (const name of ['GCash', 'GCash 2']) {
    await page.getByRole('link', { name: 'Add wallet', exact: true }).click();
    await page.getByRole('radio', { name: 'E-wallet', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Use GoTyme preset', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Use GCash preset', exact: true }).click();
    await expect(page.getByLabel('Wallet name', { exact: true })).toHaveValue(name);
    await page.getByLabel('Wallet name', { exact: true }).focus();
    await expect(page.getByTestId('bottom-navigation')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Add transaction', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  }
  await page.getByRole('link', { name: 'Manage GCash 2', exact: true }).click();
  await page.getByLabel('Wallet name', { exact: true }).fill('GCash');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  const cards = page.getByRole('link', { name: /^Manage GCash \(/ });
  await expect(cards).toHaveCount(2);
  const labels = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  expect(new Set(labels).size).toBe(2);
  await page.screenshot({ path: testInfo.outputPath('duplicate-wallets.png'), fullPage: true });
  await page.getByRole('link', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByTestId('bottom-navigation')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /^Wallet: GCash \(/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await expect(page.getByTestId('bottom-navigation')).toBeVisible();
});
