# Reviewbox Watch — target and compatibility

Confirmed by owner: OWW231, mainland China, ColorOS Watch V7.1, Android 11 / API 30. The OPPO product table lists its original OS as ColorOS Watch 6; this does not override the owner's installed version.

## Platform decisions

- Native Kotlin and Jetpack Compose, with Wear Compose Material 3 Expressive UI components. The China build must not require Google Play services, a Wear OS shared library, Wear Data Layer, or Google account login.
- OPPO's round-screen guide explicitly specifies Android 11, percentage margins, font scaling, centered top titles and right-swipe back. Manifest declares `android.hardware.type.watch`. Application theme enables `android:windowSwipeToDismiss`.
- A web-approved, short-lived device pairing flow reuses the existing Supabase identity. It does not copy web cookies or ask for a password on the watch.
- Credential Manager and Google Tiles require runtime/platform verification. They are not accepted as working on this China model merely because an API exists for international Wear OS.
- Native UI reads the same versioned TypeScript learning core used on the web. GPA, mastery and XP are not independently reimplemented in Kotlin. Real GPA and weekly learning GPA are separate fields.
- The core now runs in an APK-bundled QuickJS runtime instead of a WebView. The API-30 China Wear emulator has no WebView provider; the old implementation crashed at startup there. The APK includes ARM64, ARMv7, x86 and x86-64 native libraries. The runtime receives JSON only, exposes no network/filesystem/reflection APIs, and uses Android `java.time` for the bundle's audited ISO date/timezone operations. This architecture removes the WebView requirement; it does not establish OWW231 physical-device compatibility.
- The Kotlin-2.1-compatible binding is pinned at `quickjs-kt-android:1.0.0-alpha13`. Before production release, evaluate a current stable binding/toolchain combination and repeat parity, ABI and memory tests. Do not silently upgrade native runtime dependencies.
- No device is currently connected through ADB. Physical gesture, battery, font scale and process-restoration acceptance remain pending until tested on OWW231.
  An API-30 round China Wear emulator (454×454, 320 dpi) is connected for development. Native gesture/scoring tests passed there at normal and 1.3× font settings; those are emulator results, not OPPO certification.

## Official references checked

- [OPPO app cooperation / model table, 11282](https://open.oppomobile.com/documentation/page/info?id=11282)
- [OPPO background indicator, 11286](https://open.oppomobile.com/documentation/page/info?id=11286): only for genuinely ongoing navigation, workout or media; a study app must not abuse it to stay alive.
- [OPPO round-screen adaptation, 12357](https://open.oppomobile.com/documentation/page/info?id=12357)
- [OPPO Watch X China specifications](https://www.oppo.com/cn/accessories/oppo-watch-x/specs/)
- [Wear Compose Material 3](https://developer.android.com/jetpack/androidx/releases/wear-compose-m3)
- [Wear authentication](https://developer.android.com/training/wearables/apps/auth-wear)

## Release gates

Source and APK compilation, protocol tests and round-screen preview do not establish physical-device compatibility. Pairing approval, revocation, offline deduplication, generation reset, account isolation, handoff conflict handling and shared-core parity must pass before a release is described as complete.
