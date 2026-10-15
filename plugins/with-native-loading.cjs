const { withMainActivity, withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withNativeLoading(config) {
  config = withMainActivity(config, (mod) => {
    let source = mod.modResults.contents;
    if (!source.includes('NativeLoading.show(this)')) {
      source = source.replace('super.onCreate(null)', 'super.onCreate(null)\n    NativeLoading.show(this)\n    SplashScreenManager.hide()');
      source = source.replace('  override fun getMainComponentName()', `  override fun onPause() {
    NativeLoading.pause()
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    NativeLoading.resume()
  }

  override fun onDestroy() {
    NativeLoading.dispose(this)
    super.onDestroy()
  }

  override fun getMainComponentName()`);
    }
    if (!source.includes('NativeLoading.show(this)')) throw new Error('Native loading: unexpected MainActivity template');
    mod.modResults.contents = source;
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (!mod.modResults.contents.includes('add(NativeLoadingPackage())')) {
      mod.modResults.contents = mod.modResults.contents.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          add(NativeLoadingPackage())');
    }
    if (!mod.modResults.contents.includes('add(NativeLoadingPackage())')) throw new Error('Native loading: unexpected MainApplication template');
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const root = mod.modRequest.projectRoot;
    const app = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const java = path.join(app, 'java/com/owllowance/app');
    await fs.mkdir(java, { recursive: true });
    await fs.mkdir(path.join(app, 'assets'), { recursive: true });
    await fs.copyFile(path.join(root, 'plugins/native-loading/NativeLoading.kt'), path.join(java, 'NativeLoading.kt'));
    await fs.copyFile(path.join(root, 'assets/owllowance-loading-loop.gif'), path.join(app, 'assets/owllowance-loading-loop.gif'));
    return mod;
  }]);
};
