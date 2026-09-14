const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────
//  Patch 1 — expo-modules-core PermissionsService.kt
//  Fix Kotlin nullability crash on Android SDK 36
// ──────────────────────────────────────────────────────────────
function patchExpoModulesCore() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-modules-core',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'adapters', 'react', 'permissions', 'PermissionsService.kt'
  );

  const before = 'return requestedPermissions.contains(permission)';
  const after = 'return requestedPermissions?.contains(permission) == true';

  if (!fs.existsSync(filePath)) {
    console.warn('[patch] expo-modules-core PermissionsService.kt not found — skipping');
    return;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(after)) {
    console.log('[patch] expo-modules-core permissions patch already applied.');
    return;
  }
  if (!source.includes(before)) {
    console.warn('[patch] expo-modules-core permissions patch target not found — skipping');
    return;
  }

  fs.writeFileSync(filePath, source.replace(before, after));
  console.log('[patch] Applied expo-modules-core Android 36 permissions patch.');
}

// ──────────────────────────────────────────────────────────────
//  Patch 2 — expo-notifications NotificationsService.kt
//  Replace deprecated getParcelable(String) with SDK 33+
//  safe alternative that works on all API levels.
// ──────────────────────────────────────────────────────────────
function patchNotificationsService() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-notifications',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'notifications', 'service', 'NotificationsService.kt'
  );

  if (!fs.existsSync(filePath)) {
    console.warn('[patch] NotificationsService.kt not found — skipping');
    return;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  // ── 2a. onScheduleNotification: getParcelable for NotificationRequest ──
  // Old: intent.extras?.getParcelable(NOTIFICATION_REQUEST_KEY)!!
  // This needs a null-safe, SDK-version-aware replacement
  const schedOld = `intent.extras?.getParcelable(NOTIFICATION_REQUEST_KEY)!!`;
  const schedNew = `getParcelableCompat(intent.extras!!, NOTIFICATION_REQUEST_KEY, NotificationRequest::class.java)!!`;
  if (source.includes(schedOld) && !source.includes(schedNew)) {
    source = source.replace(schedOld, schedNew);
    patched = true;
  }

  // ── 2b. onPresentNotification: getParcelable for Notification and NotificationBehavior ──
  const presentOld1 = `intent.extras?.getParcelable(NOTIFICATION_KEY)!!,`;
  const presentNew1 = `getParcelableCompat(intent.extras!!, NOTIFICATION_KEY, Notification::class.java)!!,`;
  if (source.includes(presentOld1) && !source.includes(presentNew1)) {
    source = source.replace(presentOld1, presentNew1);
    patched = true;
  }

  const presentOld2 = `intent.extras?.getParcelable(NOTIFICATION_BEHAVIOR_KEY)`;
  const presentNew2 = `intent.extras?.let { getParcelableCompat(it, NOTIFICATION_BEHAVIOR_KEY, NotificationBehavior::class.java) }`;
  if (source.includes(presentOld2) && !source.includes(presentNew2)) {
    source = source.replace(presentOld2, presentNew2);
    patched = true;
  }

  // ── 2c. onReceiveNotification: getParcelableExtra for Notification ──
  const recvOld = `intent.getParcelableExtra(NOTIFICATION_KEY)!!`;
  const recvNew = `getParcelableExtraCompat(intent, NOTIFICATION_KEY, Notification::class.java)!!`;
  if (source.includes(recvOld) && !source.includes(recvNew)) {
    source = source.replaceAll(recvOld, recvNew);
    patched = true;
  }

  // ── 2d. getNotificationResponseFromBroadcastIntent: getParcelableExtra ──
  const respOld1 = `intent.getParcelableExtra<Notification>(NOTIFICATION_KEY) ?: throw`;
  const respNew1 = `getParcelableExtraCompat(intent, NOTIFICATION_KEY, Notification::class.java) ?: throw`;
  if (source.includes(respOld1) && !source.includes(respNew1)) {
    source = source.replace(respOld1, respNew1);
    patched = true;
  }

  const respOld2 = `intent.getParcelableExtra<NotificationAction>(NOTIFICATION_ACTION_KEY) ?: throw`;
  const respNew2 = `getParcelableExtraCompat(intent, NOTIFICATION_ACTION_KEY, NotificationAction::class.java) ?: throw`;
  if (source.includes(respOld2) && !source.includes(respNew2)) {
    source = source.replace(respOld2, respNew2);
    patched = true;
  }

  // ── 2e. createNotificationResponseBroadcastIntent: getParcelable from Bundle ──
  const bcastOld1 = `extras?.getParcelable<Notification>(NOTIFICATION_KEY)`;
  const bcastNew1 = `extras?.let { getParcelableCompat(it, NOTIFICATION_KEY, Notification::class.java) }`;
  if (source.includes(bcastOld1) && !source.includes(bcastNew1)) {
    source = source.replace(bcastOld1, bcastNew1);
    patched = true;
  }

  const bcastOld2 = `extras?.getParcelable<NotificationAction>(NOTIFICATION_ACTION_KEY)`;
  const bcastNew2 = `extras?.let { getParcelableCompat(it, NOTIFICATION_ACTION_KEY, NotificationAction::class.java) }`;
  if (source.includes(bcastOld2) && !source.includes(bcastNew2)) {
    source = source.replace(bcastOld2, bcastNew2);
    patched = true;
  }

  // ── 2f. onSetCategory: getParcelableExtra for NotificationCategory ──
  const catOld = `intent.getParcelableExtra(NOTIFICATION_CATEGORY_KEY)!!`;
  const catNew = `getParcelableExtraCompat(intent, NOTIFICATION_CATEGORY_KEY, NotificationCategory::class.java)!!`;
  if (source.includes(catOld) && !source.includes(catNew)) {
    source = source.replace(catOld, catNew);
    patched = true;
  }

  // ── 2g. getSerializable for EXCEPTION_KEY in the scheduling path ──
  // Line 57 and 80 in NotificationScheduler.kt (handled separately below)

  // ── 2h. Add helper functions if not already present ──
  const helpers = `
    // ── SDK-36-safe Parcelable helpers ──
    @JvmStatic
    @Suppress("DEPRECATION")
    fun <T : Parcelable> getParcelableCompat(bundle: Bundle, key: String, clazz: Class<T>): T? {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        bundle.getParcelable(key, clazz)
      } else {
        bundle.getParcelable(key)
      }
    }

    @JvmStatic
    @Suppress("DEPRECATION")
    fun <T : Parcelable> getParcelableExtraCompat(intent: Intent, key: String, clazz: Class<T>): T? {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(key, clazz)
      } else {
        intent.getParcelableExtra(key)
      }
    }

    @JvmStatic
    @Suppress("DEPRECATION")
    fun <T : java.io.Serializable> getSerializableCompat(bundle: Bundle, key: String, clazz: Class<T>): T? {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        bundle.getSerializable(key, clazz)
      } else {
        @Suppress("UNCHECKED_CAST")
        bundle.getSerializable(key) as? T
      }
    }
`;
  const helperMarker = '// ── SDK-36-safe Parcelable helpers ──';
  if (!source.includes(helperMarker)) {
    // Insert before the closing of the companion object (the first "  }" after the helper insertion point).
    // We'll insert before the "protected fun getUriBuilder" line which is inside companion.
    const insertBefore = '    protected fun getUriBuilder(): Uri.Builder {';
    if (source.includes(insertBefore)) {
      source = source.replace(insertBefore, helpers + '\n' + insertBefore);
      patched = true;
    }
  }

  if (patched) {
    fs.writeFileSync(filePath, source);
    console.log('[patch] Applied expo-notifications NotificationsService.kt SDK 36 patches.');
  } else {
    console.log('[patch] expo-notifications NotificationsService.kt patches already applied or targets not found.');
  }
}

// ──────────────────────────────────────────────────────────────
//  Patch 3 — expo-notifications NotificationScheduler.kt
//  Replace deprecated getSerializable and getParcelableArrayList
// ──────────────────────────────────────────────────────────────
function patchNotificationScheduler() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-notifications',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'notifications', 'notifications', 'scheduling', 'NotificationScheduler.kt'
  );

  if (!fs.existsSync(filePath)) {
    console.warn('[patch] NotificationScheduler.kt not found — skipping');
    return;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  // ── 3a. getAllScheduledNotificationsAsync: getParcelableArrayList ──
  const listOld = `resultData?.getParcelableArrayList<NotificationRequest>(NotificationsService.NOTIFICATION_REQUESTS_KEY)`;
  const listNew = `if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) resultData?.getParcelableArrayList(NotificationsService.NOTIFICATION_REQUESTS_KEY, NotificationRequest::class.java) else @Suppress("DEPRECATION") resultData?.getParcelableArrayList<NotificationRequest>(NotificationsService.NOTIFICATION_REQUESTS_KEY)`;
  if (source.includes(listOld) && !source.includes('TIRAMISU')) {
    source = source.replace(listOld, listNew);
    patched = true;
  }

  // ── 3b. scheduleNotificationAsync error path: getSerializable ──
  // Line ~57: val e = resultData?.getSerializable(NotificationsService.EXCEPTION_KEY) as Exception
  const errOld1 = `val e = resultData?.getSerializable(NotificationsService.EXCEPTION_KEY) as Exception`;
  const errNew1 = `val e = NotificationsService.getSerializableCompat(resultData!!, NotificationsService.EXCEPTION_KEY, Exception::class.java) ?: Exception("Unknown scheduling error")`;
  if (source.includes(errOld1) && !source.includes(errNew1)) {
    source = source.replace(errOld1, errNew1);
    patched = true;
  }

  // Line ~80: val e = resultData?.getSerializable(NotificationsService.EXCEPTION_KEY) as? Exception
  const errOld2 = `val e = resultData?.getSerializable(NotificationsService.EXCEPTION_KEY) as? Exception`;
  const errNew2 = `val e = resultData?.let { NotificationsService.getSerializableCompat(it, NotificationsService.EXCEPTION_KEY, Exception::class.java) }`;
  if (source.includes(errOld2)) {
    // Replace ALL instances (there are 4: lines 80, 127, 141, and similar)
    source = source.replaceAll(errOld2, errNew2);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(filePath, source);
    console.log('[patch] Applied expo-notifications NotificationScheduler.kt SDK 36 patches.');
  } else {
    console.log('[patch] expo-notifications NotificationScheduler.kt patches already applied or targets not found.');
  }
}

// ──────────────────────────────────────────────────────────────
//  Patch 4 — expo-notifications NotificationContent.java
//  Replace deprecated Parcel.readSerializable() calls
// ──────────────────────────────────────────────────────────────
function patchNotificationContent() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-notifications',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'notifications', 'notifications', 'model', 'NotificationContent.java'
  );

  if (!fs.existsSync(filePath)) {
    console.warn('[patch] NotificationContent.java not found — skipping');
    return;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  // Add import for Build if not present
  if (!source.includes('import android.os.Build;')) {
    source = source.replace(
      'import android.os.Parcel;',
      'import android.os.Build;\nimport android.os.Parcel;'
    );
    patched = true;
  }

  // Replace readSerializable() with SDK-safe version for mBadgeCount (line 163)
  const badge_old = 'mBadgeCount = (Number) in.readSerializable();';
  const badge_new = 'mBadgeCount = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) ? in.readSerializable(getClass().getClassLoader(), Number.class) : (Number) in.readSerializable();';
  if (source.includes(badge_old) && !source.includes('TIRAMISU')) {
    source = source.replace(badge_old, badge_new);
    patched = true;
  }

  // Replace readSerializable() for priorityNumber (line 173)
  const priority_old = 'Number priorityNumber = (Number) in.readSerializable();';
  const priority_new = 'Number priorityNumber = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) ? in.readSerializable(getClass().getClassLoader(), Number.class) : (Number) in.readSerializable();';
  if (source.includes(priority_old)) {
    source = source.replaceAll(priority_old, priority_new);
    patched = true;
  }

  // Replace readSerializable() for mColor (line 177)
  const color_old = 'mColor = (Number) in.readSerializable();';
  const color_new = 'mColor = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) ? in.readSerializable(getClass().getClassLoader(), Number.class) : (Number) in.readSerializable();';
  if (source.includes(color_old)) {
    source = source.replace(color_old, color_new);
    patched = true;
  }

  // Replace readParcelable(ClassLoader) with SDK-safe version for mSound (line 165)
  const sound_old = 'mSound = in.readParcelable(getClass().getClassLoader());';
  const sound_new = 'mSound = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) ? in.readParcelable(getClass().getClassLoader(), Uri.class) : in.readParcelable(getClass().getClassLoader());';
  if (source.includes(sound_old) && !source.includes('Uri.class')) {
    source = source.replace(sound_old, sound_new);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(filePath, source);
    console.log('[patch] Applied expo-notifications NotificationContent.java SDK 36 patches.');
  } else {
    console.log('[patch] expo-notifications NotificationContent.java patches already applied or targets not found.');
  }
}

// ──────────────────────────────────────────────────────────────
//  Patch 5 — expo-notifications ExpoNotificationPresentationModule.kt
//  Replace deprecated getSerializable and getParcelableArrayList
// ──────────────────────────────────────────────────────────────
function patchPresentationModule() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-notifications',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'notifications', 'notifications', 'presentation', 'ExpoNotificationPresentationModule.kt'
  );

  if (!fs.existsSync(filePath)) {
    console.warn('[patch] ExpoNotificationPresentationModule.kt not found — skipping');
    return;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  // getParcelableArrayList for Notification
  const presListOld = `resultData?.getParcelableArrayList<Notification>(NotificationsService.NOTIFICATIONS_KEY)`;
  const presListNew = `if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) resultData?.getParcelableArrayList(NotificationsService.NOTIFICATIONS_KEY, Notification::class.java) else @Suppress("DEPRECATION") resultData?.getParcelableArrayList<Notification>(NotificationsService.NOTIFICATIONS_KEY)`;
  if (source.includes(presListOld) && !source.includes('TIRAMISU')) {
    source = source.replace(presListOld, presListNew);
    patched = true;
  }

  // getSerializable for Exception
  const presErrOld = `val e = resultData?.getSerializable(NotificationsService.EXCEPTION_KEY) as? Exception`;
  const presErrNew = `val e = resultData?.let { NotificationsService.getSerializableCompat(it, NotificationsService.EXCEPTION_KEY, Exception::class.java) }`;
  if (source.includes(presErrOld)) {
    source = source.replaceAll(presErrOld, presErrNew);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(filePath, source);
    console.log('[patch] Applied expo-notifications ExpoNotificationPresentationModule.kt SDK 36 patches.');
  } else {
    console.log('[patch] ExpoNotificationPresentationModule.kt patches already applied or targets not found.');
  }
}

// ──────────────────────────────────────────────────────────────
//  Patch 6 — expo-notifications ExpoNotificationCategoriesModule.kt
//  Replace deprecated getParcelableArrayList and getParcelable/getSerializable
// ──────────────────────────────────────────────────────────────
function patchCategoriesModule() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-notifications',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'notifications', 'notifications', 'categories', 'ExpoNotificationCategoriesModule.kt'
  );

  if (!fs.existsSync(filePath)) {
    console.warn('[patch] ExpoNotificationCategoriesModule.kt not found — skipping');
    return;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  // getParcelableArrayList for NotificationCategory
  const catListOld = `resultData?.getParcelableArrayList<NotificationCategory>(NotificationsService.NOTIFICATION_CATEGORIES_KEY)`;
  const catListNew = `if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) resultData?.getParcelableArrayList(NotificationsService.NOTIFICATION_CATEGORIES_KEY, NotificationCategory::class.java) else @Suppress("DEPRECATION") resultData?.getParcelableArrayList<NotificationCategory>(NotificationsService.NOTIFICATION_CATEGORIES_KEY)`;
  if (source.includes(catListOld) && !source.includes('TIRAMISU')) {
    source = source.replace(catListOld, catListNew);
    patched = true;
  }

  // getParcelable for NotificationCategory
  const catParOld = `resultData?.getParcelable<NotificationCategory>(NotificationsService.NOTIFICATION_CATEGORY_KEY)`;
  const catParNew = `resultData?.let { NotificationsService.getParcelableCompat(it, NotificationsService.NOTIFICATION_CATEGORY_KEY, NotificationCategory::class.java) }`;
  if (source.includes(catParOld) && !source.includes('getParcelableCompat')) {
    source = source.replace(catParOld, catParNew);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(filePath, source);
    console.log('[patch] Applied expo-notifications ExpoNotificationCategoriesModule.kt SDK 36 patches.');
  } else {
    console.log('[patch] ExpoNotificationCategoriesModule.kt patches already applied or targets not found.');
  }
}

// ──────────────────────────────────────────────────────────────
//  Patch 7 — expo-notifications SingleNotificationHandlerTask.java
//  Replace deprecated getSerializable
// ──────────────────────────────────────────────────────────────
function patchHandlerTask() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-notifications',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'notifications', 'notifications', 'handling', 'SingleNotificationHandlerTask.java'
  );

  if (!fs.existsSync(filePath)) {
    console.warn('[patch] SingleNotificationHandlerTask.java not found — skipping');
    return;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  const handlerOld = `(Exception) resultData.getSerializable(NotificationsService.EXCEPTION_KEY)`;
  const handlerNew = `(android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) ? resultData.getSerializable(NotificationsService.EXCEPTION_KEY, Exception.class) : (Exception) resultData.getSerializable(NotificationsService.EXCEPTION_KEY)`;
  if (source.includes(handlerOld) && !source.includes('TIRAMISU')) {
    source = source.replace(handlerOld, handlerNew);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(filePath, source);
    console.log('[patch] Applied expo-notifications SingleNotificationHandlerTask.java SDK 36 patches.');
  } else {
    console.log('[patch] SingleNotificationHandlerTask.java patches already applied or targets not found.');
  }
}

// ──────────────────────────────────────────────────────────────
//  Patch 8 — expo-notifications NotificationScheduler.kt
//  Detailed Error Surfacing for scheduling failures
// ──────────────────────────────────────────────────────────────
function patchNotificationSchedulerDetailedErrors() {
  const filePath = path.join(
    __dirname, '..', 'node_modules', 'expo-notifications',
    'android', 'src', 'main', 'java', 'expo', 'modules',
    'notifications', 'notifications', 'scheduling', 'NotificationScheduler.kt'
  );

  if (!fs.existsSync(filePath)) return;
  let source = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  const target1 = 'promise.reject("ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE", "Failed to schedule the notification. ${e?.message}", e)';
  const new1 = 'val causeMsg = e?.cause?.let { it.javaClass.name + ": " + it.message } ?: "none"\n              val detailedMessage = "Class: ${e?.javaClass?.name}, Message: ${e?.message}, Cause: $causeMsg"\n              promise.reject("ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE", "Failed to schedule the notification. $detailedMessage", e)';
  if (source.includes(target1)) {
    source = source.replace(target1, new1);
    patched = true;
  }

  const target2 = 'promise.reject("ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE", "Failed to schedule the notification. ${e.message}", e)';
  const new2 = 'val causeMsg = e.cause?.let { it.javaClass.name + ": " + it.message } ?: "none"\n        val detailedMessage = "Class: ${e.javaClass.name}, Message: ${e.message}, Cause: $causeMsg"\n        promise.reject("ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE", "Failed to schedule the notification. $detailedMessage", e)';
  if (source.includes(target2)) {
    source = source.replaceAll(target2, new2);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(filePath, source);
    console.log('[patch] Added detailed error surfacing to NotificationScheduler.kt.');
  }
}

// ═══════════════════════════════════════════════════════════════
//  Run all patches
// ═══════════════════════════════════════════════════════════════
console.log('═══ SaveIt EAS Post-Install Patches (SDK 36 Compatibility) ═══');
patchExpoModulesCore();
patchNotificationsService();
patchNotificationScheduler();
patchNotificationContent();
patchPresentationModule();
patchCategoriesModule();
patchHandlerTask();
patchNotificationSchedulerDetailedErrors();
console.log('═══ All patches complete ═══');
