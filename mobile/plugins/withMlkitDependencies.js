const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

// expo-camera (barcode_ui) and Tap's card scanner (ocr) both declare
// com.google.mlkit.vision.DEPENDENCIES, which breaks the manifest merge.
// Declare the union in the app manifest and let it replace the libraries' values.
const NAME = "com.google.mlkit.vision.DEPENDENCIES";
const VALUE = "barcode_ui,ocr,OCR-B,OCR-A";

module.exports = function withMlkitDependencies(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app["meta-data"] = (app["meta-data"] ?? []).filter((m) => m.$["android:name"] !== NAME);
    app["meta-data"].push({
      $: { "android:name": NAME, "android:value": VALUE, "tools:replace": "android:value" },
    });
    return config;
  });
};
