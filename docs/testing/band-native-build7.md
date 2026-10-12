# Band Build 7: Re-entry, Startup And Denser List

Implemented and verified directly, without subagents. This supersedes the build 6
list layout and its exit path. Real-secret transfer remains disabled.

## Physical Report (build 6, firmware 3.2.8)

- Cold open: about 0.4s black, then "AuthBand" alone for about 1.4s, then the list.
- Re-entry: after exiting and reopening, "AuthBand" for about 0.5s, then a fully black,
  unresponsive screen for 12+ seconds. The band appeared to reset afterwards.
- List: four rows (21/16px), large empty bands, "1 / 8" indicator. Tab swipes felt
  less smooth than built-in apps.

## Black Screen: What The Emulator Shows

Reproduced with the build 6 RPK on the dedicated Vela emulator, using native input
and the AMS/AIOTJS log:

1. A launch request that arrives while the exiting instance is still finishing is
   consumed by AMS resuming that same, dying activity (`switchTaskToActive`, then
   `[resuming] to [resumed]`, `terminateApplication`, `onDestroy`). The resumed page
   is build 6's exit state: `exit()` had cleared `groups`, so only the "AuthBand"
   title is drawn. The process is then destroyed, the screen stays black and the
   new launch is lost. Frames: `build6-reentry-race/` in the build 7 handoff folder.
   This matches the video (title about 0.5s, then black).
2. A launch after `finish` but during runtime teardown starts a second `vappxms`
   for the package while the old one is still in `Free runtime`. On this debug
   image any second quickapp VM panics the kernel in the debugger's inspector
   thread (also reproduced by starting an unrelated app). That panic is an emulator
   artifact; it is not evidence of the band's reset mechanism. Whether firmware 3.2.8
   resets for the same reason is not established.

The race itself is in the platform's activity manager. The app cannot stop the
launcher from reusing or duplicating an instance that is exiting. What the app
controlled, and build 7 changes:

- `exit()` assigns no reactive state (no list teardown, no title-only frame), starts
  no file write, stops timers, destroys the viewer and detaches interconnect
  callbacks. It waits at most 400ms for in-flight file callbacks so none land in a
  VM being freed. At destroy the emulator log shows `updates:0` for both builds.
  Build 7 reports `mappending:227` (build 6: 8): lists mounted after first paint
  wait for native widget mapping until shown. Swipes still showed rows 19-28ms
  after release. Destroy to `Free runtime` took about 28ms. Physical teardown
  time with these pending maps is unmeasured.
- The blank swiper page before the first group is handled before every other guard.
  Build 6 ignored it while a load was in progress, which could leave the swiper
  resting on a black page.
- Hide/wake keeps the swiper and every mounted list and resumes from the in-memory
  snapshot. Build 6 cleared the groups on hide (title only), then reloaded files and
  recreated the swiper on wake. A wake after the five-minute deadline still exits.
- `$nextTick` is no longer used. The build 7 prototype crashed the native runtime in
  `ferry::Application::invokeNextTick` freeing a nested nextTick callback.
  Restoration and deferred mounting use plain timer turns.

## Startup

Same emulator session, four launches each, phases from the AIOTJS log after
`Launching App` (the debugger wait is excluded). Emulator CPU is much faster
than the band; use the ratios, not the absolute values.

| Median | Build 6 | Build 7 |
| --- | ---: | ---: |
| Page script evaluated | 218ms | 185ms |
| Activity resumed (first frame may draw) | 425ms | 216ms |
| First-frame DOM mapped | 337ms (8 lists) | 289ms (1 list) |
| List frame observed by host screenshots | ~713ms | ~547ms |
| Remaining lists mounted | n/a | 731ms, after paint |

Changes: the first frame is a dark list skeleton instead of a lone title; only the
active list is mounted with the loaded data; the other seven follow one per 60ms
timer turn, nearest first, and interconnect starts after them. The public fixture is
a JSON string parsed only when no vault exists. jsSHA SHA-256 was dropped for the
already bundled StableLib HMAC. QuickJS heap at exit fell only from 787KB to 780KB
(bytecode 592KB to 575KB): parsing about 94KB of page JS is now the largest fixed
cost. Moving the sync stack out of the first parse would need runtime evaluation of
code and was not done.

Emulator exit teardown is about 1.0s of `Free runtime` regardless of heap size.
It is dominated by this image's inspector thread and says nothing about the band.

## Layout

- Group title 25px at the top, six 66px rows per screen (24px issuer, 18px label),
  page dots instead of "1 / 8". No buttons; the band remains view-only.
- A 56px spacer ends every list. A vertical drag on a list whose rows fit exactly
  was delivered natively as a row tap and opened a code. With the spacer, that drag
  scrolls.
- Detail: 26px issuer, 19px label, 42px digits (33px for eight digits) in two
  88px groups 4px apart, countdown below.
- Codes stay out of the list. Native hashing is only confirmed on the emulator. A
  band without it would compute several JS SHA-512 HMACs per screen, which was the
  build 1-2 lag.

## Verification

```powershell
npm test
node apps/band/scripts/build.mjs --profile capability
node --test tests/rpk-page.test.mjs tests/rpk-archive.test.mjs tests/release.test.mjs
node scripts/native-band.mjs start
node scripts/native-band.mjs smoke artifacts/AuthBand-capability.rpk
node scripts/native-band.mjs idle artifacts/AuthBand-capability.rpk
```

The smoke now also runs six exit/reopen rounds from a stopped process (plain, after
detail, after a tab round trip). Hide/wake with a live process cannot be driven on
this image: starting any second app panics it. It is covered by host page tests only.

## Frozen Candidate

- Source `613f73ea8ef0fe8138409eca34c54cfc3bbcd13c`, clean, versionCode 7.
- `artifacts/final/AuthBand-band-build7-613f73e/AuthBand-capability.rpk`, 39,510 bytes.
- SHA-256 `66521defdcdc27d33a7a29fac42d51339270e7716bfdfb033e39b14a11a7e457`.
- 85 source tests and 11 package/archive/release checks passed.
- Native smoke passed on this hash: group changes observed 19-28ms after release,
  details 101-148ms, six reopen rounds reached the list, exit observed 1.57-1.6s.
- Real idle check passed: running at 290s, gone at 301.4s.
- Not verified physically: startup time, swipe feel, the re-entry race on firmware
  3.2.8, Vietnamese font rendering, BLE sync and battery.
