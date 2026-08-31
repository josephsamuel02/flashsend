// plugins/withHotspotPermissions.js
// Ensures hotspot permissions have correct flags per Phase 2 spec:
// - NEARBY_WIFI_DEVICES with neverForLocation
// - ACCESS_FINE_LOCATION maxSdkVersion 32
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

    // ACCESS_FINE_LOCATION with maxSdkVersion 32
    let fineLoc = findPerm('android.permission.ACCESS_FINE_LOCATION');
    if (!fineLoc) {
      perms.push({
        $: {
          'android:name': 'android.permission.ACCESS_FINE_LOCATION',
          'android:maxSdkVersion': '32',
        },
      });
    } else {
      fineLoc.$['android:maxSdkVersion'] = '32';
      // Ensure we don't have usesPermissionFlags on this one
    }

    // usesCleartextTraffic for local HTTP (android:usesCleartextTraffic="true" on <application>)
    // Expo schema doesn't support this directly, so inject via config plugin
    const application = appManifest.application?.[0];
    if (application && application.$) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }

    return config;
  });
};
