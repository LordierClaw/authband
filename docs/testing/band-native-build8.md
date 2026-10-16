# Band Build 8: Native-Style List And Code Page

Implemented and verified directly, without subagents. Real-secret transfer
remains disabled.

## Physical Report (build 7)

Opening still took 0.5-1s. Exiting dragged onto a black page, then 0.5-1s before
the band menu returned. Group swipes lagged behind the finger. Going back from a
code had no animation. The goal: feel like native Mi Band 10 apps, without risk of
RAM exhaustion, freezes, resets or leaks.

## Decisions

- **One vertical list instead of horizontal group tabs.** Each non-empty group is
  a header row followed by its accounts. This removes the swiper, its blank exit
  page and nested horizontal/vertical scrolling. Right swipes are free for the
  system back gesture. On the emulator both the build 7 swiper and the build 8 list
  track a held finger 1:1, so the band's swipe lag cannot be reproduced here; the
  change follows the native pattern rather than an emulator measurement. It departs
  from the original group-tab requirement and needs the owner's acceptance.
- **Code view is a router page** (`pages/code`). The system back gesture pops it
  with the firmware transition. It reads the decoded vault from `$app.$def`, so
  opening a code does no file IO. Measured on the emulator with a two-page probe:
  push to `onShow` 14-29ms; the shared object survives push/back; the system log
  records only the page name.
- **Back and exit use the system gesture.** `onBackPress` returns `false`. Neither
  this emulator image nor its controller delivers a back gesture or key, so the app
  keeps a fallback: 350ms after a right swipe, if no system back arrived, it pops the
  page or exits. A system back always wins and nothing is popped twice.
- **Rows decide tap versus swipe** from `touchstart`/`touchend` (under 14px is a
  tap). The native list delivered a horizontal drag across a row as a click.
- **Smaller startup page.** TOTP-only hashing (jsSHA SHA-1, StableLib SHA-512) moved
  to the code page bundle; protected channel and vault code stay with the list.
  Page JS: list 64KB (build 7: 94KB), code 38KB.
- **First frame maps ten list items**, and the rest is appended in one step. On the
  emulator a press that started during or just after a list re-layout lost its
  `touchend`. So the append happens when the list reaches its bottom (after the
  finger lifts) or after 2.5s without touches. Mapping all 58 items up front was
  measured and rejected: first frame +83ms, later than build 7's list.
- **Precompiled bytecode was not used.** The toolkit has `--enable-jsc`, and the
  runtime looks for `.jsc` first. But the Windows compiler is a debug build that
  needs the Visual Studio debug CRT, and the step deletes the `.js` files, leaving no
  fallback if the band's QuickJS rejects the bytecode.

## Measurements (Emulator Only)

Same boot, alternating builds, three launches per block, milliseconds after the
AIOTJS `Launching App` line (the debugger wait is excluded):

| Median | Build 7 | Build 8 |
| --- | ---: | ---: |
| Page script evaluated | 157-159 | 112-116 |
| List first mapped | 212-217 (after a skeleton) | 175-177 (in the first frame) |

- Held vertical drag: finger 20-160px, content 20-160px in every sampled frame.
- Code page open: about 240ms on first open (page load), 100-150ms after that.
  Build 7's in-page detail took 100-150ms.
- Exit observed about 1.74s: 350ms fallback plus this image's fixed ~1.4s teardown
  (inspector thread). Not a band figure.

## Memory And Leaks

- 30 code open/back cycles in one process: system heap +320KB on the first open
  (the code page module stays loaded), then +6KB over the next 29 cycles.
- 10 launch/exit cycles: about +66.8KB of system heap per launch. Build 7 and a
  trivial two-page quickapp lose the same ~66.7KB per launch on this image, so this
  is emulator/platform behaviour, not AuthBand.
- QuickJS heap at exit with both pages loaded: 833KB used (build 7: about 780KB, one
  page). Timers, the ticker and interconnect callbacks are cleared on hide, destroy
  and exit; host tests check that 30 page cycles leave no timers behind.

## Verification

```powershell
npm test
node apps/band/scripts/build.mjs --profile capability
node --test tests/release.test.mjs tests/rpk-page.test.mjs tests/rpk-archive.test.mjs
node scripts/native-band.mjs start
node scripts/native-band.mjs smoke artifacts/AuthBand-capability.rpk
node scripts/native-band.mjs memory artifacts/AuthBand-capability.rpk
node scripts/native-band.mjs idle artifacts/AuthBand-capability.rpk
```

This image's adbd sometimes crashes (`lib_fdcheck` assertion) under frequent adb
shells. Restart the emulator and rerun; the app process is not involved.

## Frozen Candidate

- Source `8f307aadc95b7ad07bdab7d45c9d8507f60bc3c8`, clean, versionCode 8.
- `artifacts/final/AuthBand-band-build8-8f307aa/AuthBand-capability.rpk`, 44,805 bytes.
- SHA-256 `1c6f5acf82bb7365dcb8a1ec3bff0a9ee762d7852f1180666d1a70ae39766110`.
- 52 source tests and 10 package/archive/release checks passed. Native smoke,
  memory and idle (exit at 301.5s) passed on this hash.
- Not verified physically: the system back gesture and transitions, scroll feel,
  open and exit time, Vietnamese font rendering, BLE sync and battery.
