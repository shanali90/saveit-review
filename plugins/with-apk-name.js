const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo config plugin that renames the APK output from the default hash-based
 * name to "SaveIt.apk" so it looks trustworthy when users download it.
 */
module.exports = function withApkName(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const buildGradle = modConfig.modResults.contents;

    // Only inject if not already present
    if (!buildGradle.includes('outputFileName')) {
      const renameSnippet = `
    // Rename APK output to SaveIt.apk
    android.applicationVariants.all { variant ->
        variant.outputs.all { output ->
            outputFileName = "SaveIt.apk"
        }
    }
`;
      // Insert right before the last closing brace of the file
      const lastBrace = buildGradle.lastIndexOf('}');
      modConfig.modResults.contents =
        buildGradle.slice(0, lastBrace) + renameSnippet + buildGradle.slice(lastBrace);
    }

    return modConfig;
  });
};
