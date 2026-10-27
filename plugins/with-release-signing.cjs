const { withAppBuildGradle } = require('expo/config-plugins');

// Signs release builds with a private key only when OWLLOWANCE_RELEASE_SIGNING points at a
// properties file (storeFile, storePassword, keyAlias, keyPassword) kept outside the repository.
// Without it, release builds keep the debug key, so existing installs still update in place.
const MARKER = '// owllowance-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes(MARKER)) return mod;
    source = source.replace('    signingConfigs {\n', `    ${MARKER}
    def releaseSigningPath = System.getenv('OWLLOWANCE_RELEASE_SIGNING')
    def releaseSigning = new Properties()
    if (releaseSigningPath && file(releaseSigningPath).exists()) {
        file(releaseSigningPath).withInputStream { releaseSigning.load(it) }
    }
    signingConfigs {
        if (releaseSigning['storeFile']) {
            release {
                storeFile file(releaseSigning['storeFile'])
                storePassword releaseSigning['storePassword']
                keyAlias releaseSigning['keyAlias']
                keyPassword releaseSigning['keyPassword']
            }
        }
`);
    source = source.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig releaseSigning[\'storeFile\'] ? signingConfigs.release : signingConfigs.debug',
    );
    mod.modResults.contents = source;
    return mod;
  });
};
