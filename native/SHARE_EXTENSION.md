# SaveIt Share Extension Notes

SaveIt is Expo-managed for day-to-day development, but production share-sheet support needs native packaging.

## Android

`app.json` already declares `ACTION_SEND` intent filters for `text/plain` and `text/html`. Android shares that open the app are parsed by `App.tsx` through `Linking` and shown in the Quick Save sheet.

For a fully modal Android share target that closes back to the source app instantly, run:

```bash
npx expo prebuild
```

Then keep the generated `android/app/src/main/AndroidManifest.xml` SEND filters aligned with `app.json`.

## iOS

iOS requires a separate Share Extension target in Xcode. After `npx expo prebuild`, add a new target:

1. Xcode > File > New > Target > Share Extension.
2. Name it `SaveItShare`.
3. Enable an App Group such as `group.app.saveit.mobile`.
4. Add the same App Group to the main app target.
5. Use `native/ios/ShareViewController.swift` as the target's controller.
6. Set `NSExtensionActivationSupportsWebURLWithMaxCount` to `1` and `NSExtensionActivationSupportsText` to `true`.

The extension writes a queued save to the shared App Group container and opens `saveit://share?url=...` when the full app should handle the preview. The main app also stores queued saves locally, so offline saves are not blocked by AI or Supabase.

## AI timing

Do not call the AI enrichment endpoint from the share extension. The extension only captures URL + optional reason, then returns to the source app. The app and Supabase Edge Function enrich in the background.
