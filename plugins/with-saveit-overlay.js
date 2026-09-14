const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const OVERLAY_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE'
];

const SPECIAL_USE_PROPERTY = {
  $: {
    'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
    'android:value':
      'Shows a short-lived user-initiated floating quick-save popup after Android Sharesheet selection so the user can confirm and annotate a link before saving locally.'
  }
};

const SHARE_ACTIVITY_NAME = '.SaveItShareActivity';
const SEND_ACTION = 'android.intent.action.SEND';
const SEND_MULTIPLE_ACTION = 'android.intent.action.SEND_MULTIPLE';

const SHARE_ACTIVITY_ATTRIBUTES = {
  'android:name': SHARE_ACTIVITY_NAME,
  'android:theme': '@style/Theme.SaveIt.TransparentShare',
  'android:exported': 'true',
  'android:noHistory': 'true',
  'android:excludeFromRecents': 'true',
  'android:finishOnTaskLaunch': 'true'
};

const SHARE_SEND_FILTER = {
  action: [{ $: { 'android:name': SEND_ACTION } }],
  data: [{ $: { 'android:mimeType': 'text/*' } }],
  category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
};

const SPLASH_DRAWABLE = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item>
    <shape android:shape="rectangle">
      <gradient
        android:angle="270"
        android:startColor="#0A0A1A"
        android:endColor="#2D1B69" />
    </shape>
  </item>
</layer-list>
`;

module.exports = function withSaveItOverlay(config) {
  config = AndroidConfig.Permissions.withPermissions(config, OVERLAY_PERMISSIONS);

  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return modConfig;

    application.service = application.service ?? [];
    const services = application.service;
    const existing = services.find((service) => service.$?.['android:name'] === '.SaveItOverlayService');
    if (existing) {
      existing.$['android:exported'] = 'false';
      existing.$['android:foregroundServiceType'] = 'specialUse';
      existing.property = [SPECIAL_USE_PROPERTY];
    } else {
      services.push({
        $: {
          'android:name': '.SaveItOverlayService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse'
        },
        property: [SPECIAL_USE_PROPERTY]
      });
    }

    application.activity = application.activity ?? [];
    const activities = application.activity;
    const mainActivity = activities.find((activity) => activity.$?.['android:name'] === '.MainActivity');
    if (mainActivity?.['intent-filter']) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'].filter((intentFilter) => !hasSendAction(intentFilter));
    }

    const shareActivity = activities.find((activity) => activity.$?.['android:name'] === SHARE_ACTIVITY_NAME);
    if (shareActivity) {
      shareActivity.$ = { ...shareActivity.$, ...SHARE_ACTIVITY_ATTRIBUTES };
      shareActivity['intent-filter'] = [SHARE_SEND_FILTER];
    } else {
      activities.push({
        $: SHARE_ACTIVITY_ATTRIBUTES,
        'intent-filter': [SHARE_SEND_FILTER]
      });
    }

    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const drawableDir = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(path.join(drawableDir, 'splashscreen.xml'), SPLASH_DRAWABLE);
      return modConfig;
    }
  ]);
};

function hasSendAction(intentFilter) {
  return (intentFilter.action ?? []).some((action) => {
    const name = action.$?.['android:name'];
    return name === SEND_ACTION || name === SEND_MULTIPLE_ACTION;
  });
}
