"""Exercise the installed APK on the dedicated Owllowance test emulator only.

Uses Android's adb/UiAutomator tools and synthetic records. It never targets a
physical device or a differently named emulator. See docs/ANDROID-VERIFICATION.md.
"""

import argparse
import hashlib
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = 'com.owllowance.app'
AVD = 'Owllowance_API_35'


class AndroidSmoke:
    def __init__(self, adb, serial, output):
        self.adb = str(adb)
        self.serial = serial
        self.output = output
        self.output.mkdir(parents=True, exist_ok=True)
        self.checks = []
        self.apk_sha256 = None

    def command(self, *args, binary=False, timeout=30):
        result = subprocess.run(
            [self.adb, '-s', self.serial, *args], capture_output=True,
            timeout=timeout, check=True,
        )
        return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()

    def shell(self, *args):
        return self.command('shell', *args)

    def guard(self):
        if not self.serial.startswith('emulator-'):
            raise RuntimeError('This runner only supports the dedicated test emulator.')
        names = self.command('emu', 'avd', 'name').splitlines()
        if AVD not in names:
            raise RuntimeError(f'Refusing to modify a device other than {AVD}.')

    def tree(self):
        self.shell('uiautomator', 'dump', '--compressed', '/sdcard/owllowance-smoke.xml')
        xml = self.shell('cat', '/sdcard/owllowance-smoke.xml')
        return ET.fromstring(xml[xml.index('<?xml'):])

    @staticmethod
    def bounds(node):
        values = [int(value) for value in re.findall(r'\d+', node.attrib.get('bounds', ''))]
        return values if len(values) == 4 else [0, 0, 0, 0]

    def find(self, label, tree=None, class_name=None):
        tree = tree if tree is not None else self.tree()
        bottom = self.visible_bottom()
        for node in tree.iter('node'):
            if label not in [node.attrib.get('text'), node.attrib.get('content-desc')]:
                continue
            if class_name and node.attrib.get('class') != class_name:
                continue
            x1, y1, x2, y2 = self.bounds(node)
            if x2 > x1 and y2 > y1 and y2 <= bottom:
                return node
        return None

    def wait_for(self, label, timeout=25):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.find(label) is not None:
                return
            time.sleep(0.5)
        raise AssertionError(f'Expected screen element: {label}')

    def scroll(self, direction='down'):
        tree = self.tree()
        candidates = [node for node in tree.iter('node') if node.attrib.get('scrollable') == 'true']
        if not candidates:
            raise AssertionError('No visible scrollable area.')
        x1, y1, x2, y2 = self.bounds(candidates[0])
        x = (x1 + x2) // 2
        top, bottom = y1 + 50, min(y2, self.visible_bottom()) - 50
        if bottom <= top:
            raise AssertionError('No unobscured scrollable area.')
        start, end = (bottom, top) if direction == 'down' else (top, bottom)
        self.shell('input', 'swipe', str(x), str(start), str(x), str(end), '450')
        time.sleep(0.3)

    def tap(self, label, scroll=False):
        attempts = 7
        for index in range(attempts):
            node = self.find(label)
            if node is not None:
                x1, y1, x2, y2 = self.bounds(node)
                self.shell('input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                time.sleep(0.3)
                return
            if index + 1 < attempts:
                if scroll:
                    self.scroll()
                else:
                    time.sleep(0.3)
        raise AssertionError(f'Cannot reach control: {label}')

    def fill(self, label, value):
        node = None
        for _ in range(7):
            node = self.find(label, class_name='android.widget.EditText')
            if node is not None:
                break
            self.scroll()
        if node is None:
            raise AssertionError(f'Input not found: {label}')
        x1, y1, x2, y2 = self.bounds(node)
        self.shell('input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
        self.shell('input', 'keyevent', 'KEYCODE_MOVE_END')
        old = node.attrib.get('text', '')
        self.shell('input', 'keyevent', *(['KEYCODE_DEL'] * (len(old) + 1)))
        self.shell('input', 'text', value.replace(' ', '%s'))
        time.sleep(0.2)

    def keyboard_visible(self):
        return self.keyboard_window() is not None

    def keyboard_window(self):
        windows = self.shell('dumpsys', 'window', 'windows')
        for block in re.split(r'(?=  Window #\d+ )', windows):
            if re.search(r'Window\{[^\n]+ InputMethod\}', block) and re.search(r'\bisVisible=true\b', block):
                return block
        return None

    def visible_bottom(self):
        keyboard = self.keyboard_window()
        if keyboard:
            region = re.search(r'touchable region=SkRegion\(\(\d+,(\d+),', keyboard)
            if region:
                return int(region.group(1))
        return 100_000

    def hide_keyboard(self):
        if self.keyboard_visible():
            self.shell('input', 'keyevent', 'KEYCODE_BACK')
            time.sleep(0.3)

    def screenshot(self, name):
        (self.output / f'{name}.png').write_bytes(self.command('exec-out', 'screencap', '-p', binary=True))
        # Screenshots and UI trees contain synthetic data from this guarded AVD.
        ET.ElementTree(self.tree()).write(self.output / f'{name}.xml', encoding='utf-8')

    def launch(self):
        self.shell('am', 'start', '-W', '-n', f'{PACKAGE}/.MainActivity')

    def check(self, description):
        self.checks.append(description)
        print(f'PASS: {description}', flush=True)

    def run(self, apk, reset):
        self.guard()
        if apk:
            self.apk_sha256 = hashlib.sha256(apk.read_bytes()).hexdigest()
            self.command('install', '-r', str(apk.resolve()), timeout=120)
        self.shell('am', 'force-stop', PACKAGE)
        if reset:
            if self.shell('pm', 'clear', PACKAGE) != 'Success':
                raise RuntimeError('Could not reset the dedicated test installation.')
        original_airplane = self.shell('settings', 'get', 'global', 'airplane_mode_on')
        original_scale = self.shell('settings', 'get', 'system', 'font_scale')
        try:
            self.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
            if self.shell('settings', 'get', 'global', 'airplane_mode_on') != '1':
                raise AssertionError('Airplane mode did not activate.')
            offline = False
            for _ in range(10):
                if 'Active default network: none' in self.shell('dumpsys', 'connectivity'):
                    offline = True
                    break
                time.sleep(0.5)
            if not offline:
                raise AssertionError('The test emulator still has an active network.')
            self.check('Airplane mode is active and Android reports no default network')
            self.launch()
            self.wait_for('Start with one wallet.')
            self.fill('Wallet name', 'Smoke cash')
            self.fill('Opening balance (PHP)', '1000')
            if not self.keyboard_visible():
                raise AssertionError('Opening balance input did not show the soft keyboard.')
            self.screenshot('wallet-keyboard')
            self.tap('Create wallet', scroll=True)
            self.wait_for('₱1,000.00')
            self.wait_for('₱0.00')
            self.check('Wallet setup succeeds in airplane mode with the soft keyboard open')

            self.tap('Add expense')
            self.wait_for('Amount (PHP)')
            self.fill('Amount (PHP)', '0.001')
            self.hide_keyboard()
            self.tap('Food & drink', scroll=True)
            self.tap('Save expense', scroll=True)
            self.wait_for('Enter an amount with up to two decimal places, without commas.')
            for _ in range(5):
                if self.find('Amount (PHP)', class_name='android.widget.EditText') is not None:
                    break
                self.scroll('up')
            retained = self.find('Amount (PHP)', class_name='android.widget.EditText')
            if retained is None or retained.attrib.get('text') != '0.001':
                raise AssertionError('Validation did not preserve the entered amount.')
            self.fill('Amount (PHP)', '120.29')
            self.screenshot('expense-keyboard')
            self.hide_keyboard()
            self.tap('Add a note', scroll=True)
            self.fill('Note (optional)', 'Synthetic Android lunch')
            self.tap('Save expense', scroll=True)
            self.wait_for('₱879.71')
            self.wait_for('₱120.29')
            self.check('Invalid precision preserves the form; a valid expense saves correct centavos offline')
            self.screenshot('home-light')

            self.shell('am', 'force-stop', PACKAGE)
            self.launch()
            self.wait_for('₱879.71')
            self.wait_for('₱120.29')
            self.check('Force-stop and cold launch preserve the committed balance and spending')
            self.tap('Activity')
            self.wait_for('Synthetic Android lunch')
            self.wait_for('Opening balance')
            self.screenshot('activity')
            self.check('Activity preserves the note and distinguishes the opening balance')

            self.shell('settings', 'put', 'system', 'font_scale', '1.3')
            self.shell('cmd', 'uimode', 'night', 'yes')
            self.shell('am', 'force-stop', PACKAGE)
            self.launch()
            self.wait_for('₱879.71')
            self.screenshot('home-dark-large-text')
            self.tap('Add expense')
            self.wait_for('Amount (PHP)')
            self.hide_keyboard()
            self.tap('Other', scroll=True)
            self.tap('Save expense', scroll=True)
            self.wait_for('Enter an amount with up to two decimal places, without commas.')
            self.screenshot('expense-dark-large-text')
            self.check('At 130% text size in dark mode, expense controls remain reachable')
        finally:
            self.shell('settings', 'put', 'system', 'font_scale', original_scale if original_scale != 'null' else '1.0')
            self.shell('cmd', 'uimode', 'night', 'no')
            self.shell('cmd', 'connectivity', 'airplane-mode', 'enable' if original_airplane == '1' else 'disable')

    def report(self, status, error=None):
        data = {
            'status': status, 'avd': AVD, 'serial': self.serial,
            'androidRelease': self.shell('getprop', 'ro.build.version.release'),
            'api': self.shell('getprop', 'ro.build.version.sdk'),
            'abi': self.shell('getprop', 'ro.product.cpu.abi'),
            'package': PACKAGE, 'checks': self.checks, 'error': error,
            'apkSha256': self.apk_sha256,
            'limitations': ['Emulator only; no physical device, iOS or TalkBack verification.'],
        }
        (self.output / 'report.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', required=True, type=Path)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--apk', type=Path)
    parser.add_argument('--reset-test-data', action='store_true', help='Clear only this package on the guarded test AVD before running.')
    parser.add_argument('--output', type=Path, default=Path('.expo/android-smoke'))
    args = parser.parse_args()
    runner = AndroidSmoke(args.adb, args.serial, args.output)
    # Refuse the device before any diagnostic capture, installation or mutation.
    runner.guard()
    try:
        runner.run(args.apk, args.reset_test_data)
        runner.report('passed')
    except Exception as failure:
        runner.screenshot('failure')
        runner.report('failed', str(failure))
        raise


if __name__ == '__main__':
    main()
