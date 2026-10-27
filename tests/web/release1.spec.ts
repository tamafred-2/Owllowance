import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function setup(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Opening balance (PHP)', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
  await page.getByLabel('Wallet name', { exact: true }).fill('Savings');
  await page.getByLabel('Opening balance (PHP)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
}

async function addExpense(page: Page, amount: string, category = 'Food & drink') {
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByLabel('Amount (PHP)', { exact: true }).fill(amount);
  await page.getByRole('radio', { name: category, exact: true }).click();
  await page.getByRole('radio', { name: 'Wallet: Cash', exact: true }).click();
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByText('Expense saved.', { exact: true })).toBeVisible();
}

test('transfer with fee moves money, appears once in history and can be deleted', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Transfer', exact: true }).click();
  await page.getByLabel('Amount (PHP)', { exact: true }).fill('300');
  await page.getByRole('radio', { name: 'Send from: Cash', exact: true }).click();
  await page.getByRole('radio', { name: 'Send to: Savings', exact: true }).click();
  await page.getByLabel('Transfer fee', { exact: true }).fill('1000');
  await expect(page.getByText("The fee can't be more than the amount you send.", { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save transfer', exact: true })).toBeDisabled();
  await page.getByLabel('Transfer fee', { exact: true }).fill('15');
  await expect(page.getByTestId('transfer-preview')).toContainText('-₱315.00');
  await page.screenshot({ path: testInfo.outputPath('transfer-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save transfer', exact: true }).click();
  await expect(page.getByText('Transfer saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('685.00');
  await expect(page.getByRole('link', { name: 'Manage Savings', exact: true })).toContainText('500.00');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByText('Cash → Savings', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('transfer-fee')).toContainText('-₱15.00');
  await expect(page.getByText('Fees', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('history-transfer-fee.png') });
  await page.getByText('Cash → Savings', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete transfer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByText('Cash → Savings', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('1,000.00');
});

test('transfer opened from a wallet shows that wallet as the fixed source', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('button', { name: 'Wallet options: Savings', exact: true }).click();
  await page.getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(page.getByTestId('transfer-source')).toContainText('Savings');
  await expect(page.getByTestId('transfer-source')).toContainText('₱200.00');
  await expect(page.getByRole('radio', { name: /^Send from:/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Send to: Savings', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Note (optional)', { exact: true })).toHaveCount(0);
  await page.getByLabel('Amount (PHP)', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Save transfer', exact: true }).click();
  await expect(page.getByText('Choose both wallets.', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Send to: Cash', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('transfer-fixed-source.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save transfer', exact: true }).click();
  await expect(page.getByText('Transfer saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage Savings', exact: true })).toContainText('150.00');
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('1,050.00');
});

test('edit, duplicate and delete an expense; history filters and search narrow results', async ({ page }, testInfo) => {
  await setup(page);
  await addExpense(page, '50');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /^Food & drink,.*Open details$/ }).click();
  await expect(page.getByRole('heading', { name: 'Edit expense', exact: true })).toBeVisible();
  await page.getByLabel('Amount (PHP)', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByLabel('Note (optional)', { exact: true }).fill('Team lunch');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('entry-sheet')).toHaveCount(0);
  await expect(page.getByText('Team lunch', { exact: true })).toBeVisible();
  await page.getByText('Team lunch', { exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add an expense', exact: true })).toBeVisible();
  await expect(page.getByLabel('Amount (PHP)', { exact: true })).toHaveValue('80.00');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByText('Team lunch', { exact: true })).toHaveCount(2);
  await page.getByLabel('Search', { exact: true }).fill('lunch');
  await expect(page.getByText('Opening balance', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  await expect(page.getByText('No matches', { exact: true })).toBeVisible();
  // Filters, Clear and Export stay on one line at phone width.
  const rowY = async (name: string) => (await page.getByRole('button', { name, exact: true }).boundingBox())!.y;
  expect(Math.abs(await rowY('Export CSV') - await rowY('Hide filters'))).toBeLessThan(4);
  expect(Math.abs(await rowY('Clear filters') - await rowY('Hide filters'))).toBeLessThan(4);
  await page.screenshot({ path: testInfo.outputPath('history-filter-row.png') });
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByText('Team lunch', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete expense', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByText('Transaction deleted.', { exact: true })).toBeVisible();
  await expect(page.getByText('Team lunch', { exact: true })).toHaveCount(1);
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('920.00');
});

test('budget progress, insights, custom category, hidden balances and theme persist', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('link', { name: 'Manage categories', exact: true }).click();
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Coffee');
  await page.getByRole('radio', { name: 'Icon coffee', exact: true }).click();
  await page.getByRole('radio', { name: 'Color amber', exact: true }).click();
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Coffee', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await addExpense(page, '120', 'Coffee');
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Create your first budget', exact: true }).click();
  await page.getByRole('button', { name: 'Coffee', exact: true }).click();
  await page.getByLabel('Limit (PHP)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save budget', exact: true }).click();
  await expect(page.getByTestId('budget-list')).toContainText('over');
  await page.screenshot({ path: testInfo.outputPath('plan-budget.png'), fullPage: true });
  await expect(page.getByText(/insights/i)).toHaveCount(0); // Insights opens only from Home.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await expect(page.getByText('Spending by category', { exact: true })).toBeVisible();
  await expect(page.getByTestId('category-breakdown')).toContainText('1 transaction · 100%');
  await expect(page.getByTestId('category-breakdown')).toContainText('New this month');
  await page.screenshot({ path: testInfo.outputPath('insights-categories.png'), fullPage: true });
  await page.getByRole('button', { name: /^Coffee: .*Show transactions$/ }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByTestId('history-filters')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coffee', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Opening balance', { exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByText('Spending by category', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Reduce motion', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Privacy', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide balance', exact: true })).toHaveCount(3); // Net worth + two cards.
  await page.getByRole('button', { name: 'Hide balance', exact: true }).nth(1).click(); // The eye on the Cash card.
  await expect(page.getByRole('heading', { name: 'Manage wallet', exact: true })).toHaveCount(0); // Did not open the card.
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('₱ ••••');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('₱ ••••');
  await expect(page.getByRole('link', { name: 'Manage Savings', exact: true })).toContainText('₱200.00');
  await expect(page.getByText('₱ ••••', { exact: true })).toHaveCount(1); // Net worth stays visible.
  await expect(page.getByTestId('bottom-navigation')).toHaveCSS('background-color', 'rgb(34, 40, 51)');
  await page.screenshot({ path: testInfo.outputPath('hidden-dark.png'), fullPage: true });
});

test('backup export then restore replaces data and can be undone', async ({ page }) => {
  await setup(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadPromise;
  const backup = readFileSync(await download.path(), 'utf8');
  expect(JSON.parse(backup).format).toBe('owllowance-backup');
  await expect(page.getByText(/^Last backup:/)).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await addExpense(page, '400');
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from backup', exact: true }).click();
  await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(page.getByTestId('restore-preview')).toContainText('2 wallets');
  await page.getByRole('button', { name: 'Replace and restore', exact: true }).click();
  await expect(page.getByText('Backup restored. You can undo this below.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('1,000.00');
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('button', { name: 'Undo last restore', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm undo', exact: true }).click();
  await expect(page.getByText('Your data from before the restore is back.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Manage Cash', exact: true })).toContainText('600.00');
  const bad = page.waitForEvent('filechooser');
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('button', { name: 'Restore from backup', exact: true }).click();
  await (await bad).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(page.getByText(/not an Owllowance backup/)).toBeVisible();
});

test('wallet list, grid and swipeable card views; choice is remembered', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('radio', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'List view', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('link', { name: 'Manage Savings', exact: true })).toContainText('₱200.00');
  await page.screenshot({ path: testInfo.outputPath('wallet-list.png'), fullPage: true });
  await page.getByRole('radio', { name: 'Card view', exact: true }).click();
  await expect(page.getByTestId('wallet-view-label')).toHaveText('Card view');
  const front = page.getByTestId('wallet-deck-front');
  await expect(front).toContainText('Cash');
  await page.screenshot({ path: testInfo.outputPath('wallet-cards.png'), fullPage: true });
  await expect(page.getByText(/ of 2$/)).toHaveCount(0); // No position counter or arrows.
  const box = (await page.getByTestId('wallet-deck').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6 - 60, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6 - 140, { steps: 4 });
  await page.mouse.up();
  await expect(front).toContainText('Savings');
  await expect(page.getByRole('heading', { name: 'Manage wallet', exact: true })).toHaveCount(0); // The swipe didn't open it.
  await expect(page.getByTestId('wallet-deck')).not.toContainText(/\d{4} \d{4}/); // No card-number style text.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(front).toContainText('Savings'); // Stays where it was left.
  await page.reload();
  await expect(front).toContainText('Savings'); // Also after restarting.
  await expect(page.getByRole('radio', { name: 'Card view', exact: true })).toHaveAttribute('aria-checked', 'true');
  const deck = (await page.getByTestId('wallet-deck').boundingBox())!;
  await page.mouse.move(deck.x + deck.width / 2, deck.y + deck.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(deck.x + deck.width / 2, deck.y + deck.height * 0.3 + 60, { steps: 4 });
  await page.mouse.move(deck.x + deck.width / 2, deck.y + deck.height * 0.3 + 140, { steps: 4 });
  await page.mouse.up();
  await expect(front).toContainText('Cash'); // Swipe down brings the previous wallet back.
  await page.waitForTimeout(400); // Let the swipe settle; a tap ending a swipe is intentionally ignored.
  await front.click();
  await expect(page.getByRole('heading', { name: 'Manage wallet', exact: true })).toBeVisible();
});

test('entry forms open as a sheet over the current page and close back to it', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const sheet = page.getByTestId('entry-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Add an expense', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeAttached(); // The page stays underneath.
  await page.waitForTimeout(400); // Let the slide-up finish for the screenshot.
  await page.screenshot({ path: testInfo.outputPath('expense-sheet.png') });
  await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0); // No X: drag the handle down.
  { const handle = (await page.getByTestId('sheet-handle').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 80, { steps: 4 }); await page.mouse.move(handle.x + handle.width / 2, handle.y + 220, { steps: 4 });
    await page.mouse.up(); }
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Add a wallet', exact: true })).toBeVisible();
  await sheet.getByLabel('Wallet name', { exact: true }).fill('Maya');
  await sheet.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Wallet added.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage Maya', exact: true })).toBeVisible();
});
