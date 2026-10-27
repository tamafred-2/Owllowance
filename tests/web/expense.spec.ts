import { expect, test, type Page } from '@playwright/test';

async function expectBalance(page: Page, amount: string) {
  if (new URL(page.url()).pathname === '/expense' || new URL(page.url()).pathname === '/') {
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Wallet', exact: true }).click();
  await expect(page.getByText(amount, { exact: true })).toHaveCount(2);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
}

test('expense entry persists across reload, offline reopening and responsive themes', async ({ page, context }, testInfo) => {
  const uncaught: string[] = [];
  page.on('pageerror', error => uncaught.push(error.message));
  const response = await page.goto('/');
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByText('Start with one wallet.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Wallet name', exact: true }).fill('Test cash');
  await page.getByRole('textbox', { name: 'Opening balance (PHP)', exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await expectBalance(page, '₱1,000.00');
  await expect(page.getByText('₱0.00', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add expense', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount (PHP)', exact: true }).fill('0.001');
  await page.getByRole('radio', { name: 'Food & drink', exact: true }).click();
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByText('Enter an amount with up to two decimal places, without commas.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Amount (PHP)', exact: true })).toHaveValue('0.001');
  await page.getByRole('textbox', { name: 'Amount (PHP)', exact: true }).fill('120.29');
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note (optional)', exact: true }).fill('Synthetic lunch');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expectBalance(page, '₱879.71');
  await expect(page.getByText('₱120.29', { exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.screenshot({ path: testInfo.outputPath('home-desktop-light.png'), fullPage: true });
  await page.reload();
  await expectBalance(page, '₱879.71');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByText('Synthetic lunch', { exact: true })).toBeVisible();
  await expect(page.getByText('Opening balance', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Synthetic lunch', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add expense', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount (PHP)', exact: true }).fill('0.01');
  await page.getByRole('radio', { name: 'Other', exact: true }).click();
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expectBalance(page, '₱879.70');
  await expect(page.getByText('₱120.30', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-mobile-dark.png'), fullPage: true });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add expense', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('expense-mobile-dark.png'), fullPage: true });
  await expect(page.getByRole('textbox', { name: 'Amount (PHP)', exact: true })).toBeVisible();
  expect(uncaught).toEqual([]);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expectBalance(reopened, '₱879.70');
});

test('a second tab is blocked safely and can take over after the first closes', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip — start with Cash at ₱0.00', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByText('Owllowance is open in another tab. Close that tab, then retry here.')).toBeVisible();
  await page.close();
  await second.getByRole('button', { name: 'Retry local storage', exact: true }).click();
  await expect(second.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(second.getByText('₱0.00', { exact: true })).toHaveCount(3);
});

test('denied browser storage shows recovery without an ephemeral wallet', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: async () => { throw new DOMException('Synthetic denied storage', 'NotAllowedError'); },
    });
  });
  await page.goto('/');
  await expect(page.getByText('Local storage could not be opened. Check browser storage permissions and free space, then retry.')).toBeVisible();
  await expect(page.getByText('Start with one wallet.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry local storage', exact: true }).click();
  await expect(page.getByText('Local storage could not be opened. Check browser storage permissions and free space, then retry.')).toBeVisible();
});

test('browser data removal returns to honest empty setup', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Opening balance (PHP)', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const session = await context.newCDPSession(page);
  await session.send('Storage.clearDataForOrigin', { origin: 'http://localhost:4173', storageTypes: 'all' });
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByText('Start with one wallet.')).toBeVisible();
  await expect(fresh.getByText('₱10.00', { exact: true })).toHaveCount(0);
});

test('a mid-save storage failure preserves input and retry posts one expense', async ({ page, context }) => {
  // Inject one failed entry prepare into Expo SQLite's worker channel. All other
  // statements, including the earlier transaction insert and rollback, use real SQLite/WASM.
  await context.addInitScript(() => {
    const state = globalThis as typeof globalThis & { failNextEntry?: boolean };
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options?: Transferable[] | StructuredSerializeOptions) {
      if (state.failNextEntry && message.type === 'prepare' && message.data?.source?.includes('INSERT INTO entries')) {
        state.failNextEntry = false;
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, error: 'Synthetic storage failure' } })));
        return;
      }
      original.call(this, message, Array.isArray(options) ? { transfer: options } : options);
    };
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Opening balance (PHP)', exact: true }).fill('100');
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add expense', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount (PHP)', exact: true }).fill('25.50');
  await page.getByRole('radio', { name: 'Transport', exact: true }).click();
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note (optional)', exact: true }).fill('Synthetic retry');
  await page.evaluate(() => { (globalThis as typeof globalThis & { failNextEntry?: boolean }).failNextEntry = true; });
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByText('Could not save to this device. Your input is still here. Check free space and try again.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Amount (PHP)', exact: true })).toHaveValue('25.50');
  await expect(page.getByRole('textbox', { name: 'Note (optional)', exact: true })).toHaveValue('Synthetic retry');
  await expect(page.getByRole('radio', { name: 'Transport', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expectBalance(page, '₱74.50');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByText('Synthetic retry', { exact: true })).toHaveCount(1);
  await page.reload();
  await expectBalance(page, '₱74.50');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByText('Synthetic retry', { exact: true })).toHaveCount(1);
});
