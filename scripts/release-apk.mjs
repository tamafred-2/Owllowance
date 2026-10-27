// Builds the ARM64 release APK and packages it for a GitHub Release.
//   npm run release:apk              build + copy to releases/ + print SHA-256
//   npm run release:apk -- --skip-build   package the last build only
//   npm run release:apk -- --publish      also tag v<version> and upload with the GitHub CLI (gh)
// GitHub builds are signed with the private key from %USERPROFILE%/.owllowance/release-signing.properties
// (or OWLLOWANCE_RELEASE_SIGNING). Without it the APK uses the public debug key; never publish that.
// Bump "version" and "android.versionCode" in app.json before each release; Android only
// installs an update over an existing app when the versionCode is not lower.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
const version = app.version;
const tag = `v${version}`;
const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const output = join(root, 'releases', `Owllowance-${tag}-arm64.apk`);
const signing = process.env.OWLLOWANCE_RELEASE_SIGNING || join(process.env.USERPROFILE || process.env.HOME || '', '.owllowance', 'release-signing.properties');
if (!existsSync(signing)) { console.error(`Release signing file not found: ${signing}`); process.exit(1); }

function run(command, commandArgs, options = {}) {
  // Quote paths with spaces for the Windows shell.
  const quoted = process.platform === 'win32' && command.includes(' ') ? `"${command}"` : command;
  const result = spawnSync(quoted, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.status !== 0) { console.error(`\n${command} ${commandArgs.join(' ')} failed.`); process.exit(result.status ?? 1); }
}

if (!args.has('--skip-build')) {
  if (!existsSync(join(root, 'android'))) run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install']);
  // Same session settings as docs/ANDROID-VERIFICATION.md; nothing machine-wide is changed.
  const env = {
    ...process.env,
    JAVA_HOME: process.env.JAVA_HOME || join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
    ANDROID_HOME: process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    OWLLOWANCE_CMAKE_DIR: process.env.OWLLOWANCE_CMAKE_DIR || 'C:\\owl-cxx-owllowance',
    EXPO_NO_TELEMETRY: '1', NODE_ENV: 'production', OWLLOWANCE_RELEASE_SIGNING: signing,
  };
  const gradle = join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  run(gradle, [':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--max-workers=2', '--no-daemon',
    '-Dorg.gradle.parallel=false', '-Pkotlin.compiler.execution.strategy=in-process', '--console=plain',
    '--init-script', join('..', 'scripts', 'android-cmake.init.gradle')], { cwd: join(root, 'android'), env });
}

if (!existsSync(built)) { console.error('No release APK found. Run without --skip-build.'); process.exit(1); }
mkdirSync(join(root, 'releases'), { recursive: true });
copyFileSync(built, output);
const sha256 = createHash('sha256').update(readFileSync(output)).digest('hex');
const megabytes = (statSync(output).size / 1048576).toFixed(1);
console.log(`\n${tag} (versionCode ${app.android?.versionCode ?? '?'}): ${output}\n${megabytes} MB  SHA-256 ${sha256}`);

if (args.has('--publish')) {
  const gh = spawnSync('gh', ['--version'], { shell: process.platform === 'win32' });
  if (gh.status !== 0) { console.error('GitHub CLI (gh) not found. Upload the file on the Releases page instead (see below).'); }
  else {
    run('git', ['tag', tag]);
    run('git', ['push', 'origin', tag]);
    run('gh', ['release', 'create', tag, output, '--title', `Owllowance ${tag}`, '--notes', `Android (ARM64) APK.\n\nSHA-256: ${sha256}`]);
    process.exit(0);
  }
}
console.log(`\nTo publish: GitHub → Releases → Draft a new release → tag ${tag} → attach ${output.split(/[\\/]/).pop()}\nand paste the SHA-256 above into the notes.`);
