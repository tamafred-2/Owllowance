"""Verify wallet management using synthetic data on the guarded test AVD only.

Requires the debug APK installed and this project's Metro running on port 8081.
Clears only the dedicated emulator's Owllowance data, never a physical phone.
"""
import argparse
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('android_smoke', Path(__file__).with_name('android-smoke.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', required=True, type=Path)
    parser.add_argument('--serial', required=True)
    args = parser.parse_args()
    runner = module.AndroidSmoke(args.adb, args.serial, Path('.expo/android-wallet-smoke'))
    runner.guard()
    runner.command('reverse', 'tcp:8081', 'tcp:8081')
    runner.shell('am', 'force-stop', module.PACKAGE)
    assert runner.shell('pm', 'clear', module.PACKAGE) == 'Success'
    airplane = runner.shell('settings', 'get', 'global', 'airplane_mode_on')
    try:
        runner.launch()
        runner.wait_for('Start with one wallet.', timeout=90)
        runner.fill('Wallet name', 'Smoke cash')
        runner.fill('Opening balance (PHP)', '1000')
        assert runner.keyboard_visible(), 'Expected soft keyboard during wallet creation'
        runner.tap('Create wallet', scroll=True)
        runner.wait_for('Your day in focus.')
        runner.tap('Wallet')
        runner.tap('Add wallet', scroll=True)
        runner.fill('Wallet name', 'Smoke bank')
        runner.hide_keyboard()
        runner.tap('Bank')
        runner.fill('Opening balance (PHP)', '200')
        runner.tap('Create wallet', scroll=True)
        runner.wait_for('Your wallets, in one view.')
        runner.check('Created cash and bank wallets with the soft keyboard open')

        runner.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
        runner.tap('Add transaction')
        runner.fill('Amount (PHP)', '20')
        runner.hide_keyboard()
        runner.tap('Food & drink', scroll=True)
        runner.tap('Wallet: Smoke bank', scroll=True)
        runner.tap('Save expense', scroll=True)
        runner.wait_for('\u20b11,180.00')
        runner.check('Expense charged to selected bank wallet in airplane mode (Metro over USB)')
        runner.tap('Wallet')
        runner.tap('Manage Smoke bank', scroll=True)
        runner.fill('Wallet name', 'Everyday bank')
        runner.tap('Save name', scroll=True)
        runner.wait_for('Your wallets, in one view.')
        runner.tap('Manage Everyday bank', scroll=True)
        runner.tap('Archive wallet', scroll=True)
        runner.tap('Cancel', scroll=True)
        runner.tap('Archive wallet', scroll=True)
        runner.tap('Confirm archive', scroll=True)
        runner.wait_for('Your wallets, in one view.')
        runner.tap('Add transaction')
        runner.hide_keyboard()
        assert runner.find('Wallet: Everyday bank') is None
        runner.tap('Wallet: Smoke cash', scroll=True)
        runner.check('Archived wallet is excluded from expense selection')
        runner.tap('Back to Home', scroll=True)
        runner.tap('Wallet')
        runner.tap('Manage Everyday bank', scroll=True)
        runner.wait_for('Archived balance')
        runner.screenshot('archived-wallet')
        runner.tap('Restore wallet', scroll=True)
        runner.wait_for('Your wallets, in one view.')
        runner.shell('am', 'force-stop', module.PACKAGE)
        runner.launch()
        runner.wait_for('\u20b11,180.00', timeout=60)
        runner.tap('Wallet')
        runner.tap('Manage Everyday bank', scroll=True)
        runner.wait_for('Current balance')
        runner.wait_for('\u20b1180.00')
        runner.screenshot('restored-wallet')
        runner.check('Rename, archive cancellation, archive and restore survive cold launch without balance changes')
        runner.report('passed')
    except Exception as error:
        runner.screenshot('failure')
        runner.report('failed', str(error))
        raise
    finally:
        runner.shell('cmd', 'connectivity', 'airplane-mode', 'enable' if airplane == '1' else 'disable')


if __name__ == '__main__':
    main()
