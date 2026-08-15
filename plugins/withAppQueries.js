// plugins/withAppQueries.js
// Injects <queries> intent for LAUNCHER apps so PackageManager.getInstalledApplications
// can see launchable apps on Android 11+ (API 30+) without relying solely on QUERY_ALL_PACKAGES.

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = (config) => {
  return withAndroidManifest(config, (config) => {
    const modResults = config.modResults;
    // Handle both possible shapes: modResults.manifest.manifest vs modResults.manifest
    const manifestRoot = modResults.manifest?.manifest ? modResults.manifest : modResults;
    const manifest = manifestRoot.manifest || manifestRoot;

    // Ensure <queries> exists (it's at manifest level, sibling to <application>)
    if (!manifest.queries) {
      manifest.queries = [];
    }

    const launcherIntent = {
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
    };

    const hasLauncherIntent = manifest.queries.some((q) => {
      if (!q.intent) return false;
      return q.intent.some((intent) => {
        const hasMain = intent.action?.some((a) => a.$?.['android:name'] === 'android.intent.action.MAIN');
        const hasLauncher = intent.category?.some((c) => c.$?.['android:name'] === 'android.intent.category.LAUNCHER');
        return hasMain && hasLauncher;
      });
    });

    if (!hasLauncherIntent) {
      // Merge into existing <queries> if present, otherwise create new one
      if (manifest.queries.length > 0) {
        manifest.queries[0].intent = manifest.queries[0].intent || [];
        manifest.queries[0].intent.push(launcherIntent);
      } else {
        manifest.queries.push({ intent: [launcherIntent] });
      }
    }

    return config;
  });
};
