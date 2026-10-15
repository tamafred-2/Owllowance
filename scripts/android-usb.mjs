import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  (process.platform === 'win32' && path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'));
if (!sdk) throw new Error('Set ANDROID_HOME to your Android SDK directory.');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
if (!existsSync(adb)) throw new Error('Android platform-tools are missing from the selected SDK.');

function android(args) {
  const result = spawnSync(adb, args, { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error('ADB did not respond. Reconnect the phone, select Transfer files, and retry.');
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'ADB command failed.');
  return result.stdout.trim();
}

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--device')) {
  throw new Error('Usage: npm run android:usb -- [--device SERIAL]');
}
const devices = android(['devices']).split(/\r?\n/).slice(1)
  .map((line) => line.trim().split(/\s+/)).filter((parts) => parts[1] === 'device');
const serial = args[1] || (devices.length === 1 ? devices[0][0] : undefined);
if (!serial || !devices.some(([id]) => id === serial)) {
  throw new Error('Connect and authorize one Android device, or select it with --device SERIAL.');
}
const appId = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo.android.package;
if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(appId)) throw new Error('Invalid Android application ID.');
const installed = android(['-s', serial, 'shell', 'pm', 'list', 'packages', appId])
  .split(/\r?\n/).includes(`package:${appId}`);
const info = installed && android(['-s', serial, 'shell', 'dumpsys', 'package', appId]);
if (!info || !/\bDEBUGGABLE\b/.test(info)) {
  throw new Error('Install the native debug APK first. See docs/ANDROID-VERIFICATION.md.');
}

// Refuse to attach this phone to an unrelated Metro process on the same port.
for (const host of ['127.0.0.1', '::1']) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error) => {
      if (host === '::1' && error.code === 'EAFNOSUPPORT') resolve();
      else reject(new Error('Port 8081 is occupied. Stop that development server first.'));
    });
    probe.listen(8081, host, () => probe.close(resolve));
  });
}
android(['-s', serial, 'reverse', 'tcp:8081', 'tcp:8081']);
const metro = spawn(process.execPath, ['--dns-result-order=ipv4first', path.join(root, 'node_modules', 'expo', 'bin', 'cli'),
  'start', '--localhost', '--port', '8081', '--max-workers', '2'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, NODE_ENV: 'development', EXPO_NO_TELEMETRY: '1' },
});
let exited = false;
metro.once('exit', (code) => { exited = true; process.exitCode ||= code || 0; });
metro.once('error', (error) => { exited = true; console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => metro.kill(signal));

try {
  let ready = false;
  for (let attempt = 0; attempt < 120 && !exited; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8081/status', { signal: AbortSignal.timeout(1000) });
      ready = response.ok && (await response.text()).includes('packager-status:running');
    } catch { /* Metro is still starting. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Metro did not become ready. Check its output above.');
  // A surviving debug runtime retains closed HMR sockets after Metro restarts.
  // Cold launch only this app once the new server is ready; SQLite stays intact.
  android(['-s', serial, 'shell', 'am', 'start', '-S', '-n', `${appId}/.MainActivity`]);
  console.log('Android connected over USB. Keep this terminal running for live updates.');
} catch (error) {
  metro.kill();
  console.error(error.message);
  process.exitCode = 1;
}
