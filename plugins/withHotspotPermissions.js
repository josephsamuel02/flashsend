// plugins/withHotspotPermissions.js
// Ensures hotspot/wifi permissions:
// - NEARBY_WIFI_DEVICES with neverForLocation (hotspot creation, API 33+)
// - ACCESS_FINE_LOCATION uncapped (required by wifi-reborn join on ALL SDKs)
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest || config.modResults;
    const appManifest = manifest.manifest || manifest;

    // Ensure uses-permission array exists
    if (!appManifest['uses-permission']) appManifest['uses-permission'] = [];
    const perms = appManifest['uses-permission'];

    const findPerm = (name) => perms.find((p) => p.$ && p.$['android:name'] === name);

    // Ensure CHANGE_WIFI_STATE & ACCESS_WIFI_STATE exist
    ['android.permission.CHANGE_WIFI_STATE', 'android.permission.ACCESS_WIFI_STATE'].forEach((name) => {
      if (!findPerm(name)) perms.push({ $: { 'android:name': name } });
    });

    // NEARBY_WIFI_DEVICES with neverForLocation
    let nearby = findPerm('android.permission.NEARBY_WIFI_DEVICES');
    if (!nearby) {
      perms.push({
        $: {
          'android:name': 'android.permission.NEARBY_WIFI_DEVICES',
          'android:usesPermissionFlags': 'neverForLocation',
        },
      });
    } else {
      nearby.$['android:usesPermissionFlags'] = 'neverForLocation';
    }

    // ACCESS_FINE_LOCATION: required by react-native-wifi-reborn on ALL SDKs
    // (its native PermissionUtils checks FINE_LOCATION + Location services ON,
    // even on Android 13+). Do NOT cap with maxSdkVersion — the old cap broke
    // scan+join on API 33+ because the permission could never be granted.
    let fineLoc = findPerm('android.permission.ACCESS_FINE_LOCATION');
    if (!fineLoc) {
      perms.push({
        $: {
          'android:name': 'android.permission.ACCESS_FINE_LOCATION',
        },
      });
    } else if (fineLoc.$) {
      // Remove any stale maxSdkVersion cap from previous builds
      delete fineLoc.$['android:maxSdkVersion'];
    }

    // Network-state permissions needed by wifi-reborn's requestNetwork /
    // forceWifiUsage (bindProcessToNetwork) for no-internet hotspots.
    ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.CHANGE_NETWORK_STATE'].forEach((name) => {
      if (!findPerm(name)) perms.push({ $: { 'android:name': name } });
    });

    // usesCleartextTraffic for local HTTP (android:usesCleartextTraffic="true" on <application>)
    // Expo schema doesn't support this directly, so inject via config plugin
    const application = appManifest.application?.[0];
    if (application && application.$) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }

    return config;
  });
};
