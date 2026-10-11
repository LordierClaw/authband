# Band Build 6: Viewer-Only Navigation

Implemented and reviewed directly, without subagents. This supersedes build 5's
Settings, Exit and Back controls. Real-secret transfer remains disabled.

## Changes

- Cold startup begins the journal, slot, clock and preference reads together in
  `onInit`. The first list does not wait for Bluetooth or pairing reads. The
  committed journal is still verified before any account is published.
- All bounded metadata lists are prepared once. Native horizontal scrolling does
  not calculate OTPs, reload files, or recreate those lists.
- One native swiper page before the first group is an exit destination. Dragging
  right beyond the first group exits. Normal group swipes have no custom touch
  handler or click-lock state. A right swipe in detail returns to the retained list.
- No settings, pairing keypad, back/close icons or function buttons on the band.
  Six/eight digits occupy fixed 3+3 / 4+4 slots, 72px each with a 4px gap.
- A single five-minute idle alarm is reset by navigation, scrolling, selecting an
  account or touching detail. OTP ticks and synchronization do not reset it.
  Hide cancels timers; waking after the deadline exits instead of loading again.
- A committed manager update replaces the visible snapshot directly, without a
  redundant disk reload. An identical vault/revision does not rebuild the page.
- Capability pairing bootstrap moved to iPhone, after Xiaomi AuthKey authentication
  and RPK trust. It cannot replace a paired owner or adopt an orphaned vault.
  Release-profile bootstrap and personal-secret transfer stay disabled. Native
  interconnect does not itself attest this new bootstrap; real-device security
  acceptance is still required before unlocking personal accounts.
- Production compilation reduces expanded first-page JavaScript substantially.
  The local signing certificate is preserved. CI uses the toolkit public test
  certificate only when no local capability signing key exists.

## Native Findings

The generic swipe event was swallowed by the native list/swiper on this image.
Root touch listeners were also insufficient. The exit destination avoids requiring
those events. Detail needs its own start/end gesture handler; it does not handle
touchmove or animate in JavaScript.

Lifecycle hooks are not callable instance methods on the native page proxy.
Gesture/back/exit therefore call ordinary helper methods, not `this.onBackPress()`
or `this.onHide()`. A late `swiperIndex` assignment in list restoration also
crashed this renderer. Initial/restored index is assigned with the loaded groups,
not from the later restoration callback; normal tab changes never echo it back.

Native profiling found slow JavaScript HMAC, including in the build-5 baseline.
The optional [Vela binary hash API](https://iot.mi.com/vela/quickapp/en/features/security/crypto.html)
now backs StableLib HMAC and the vault checksum. Each algorithm is checked lazily
with a binary known-answer vector containing NUL and high bytes. Missing,
text-only or failing support falls back to the existing JS implementation.
Temporary byte buffers are wiped. No private keys or OTP values are logged.

A local native development probe compared all 18 RFC6238 vectors through the
actual runtime/native backend: SHA1, SHA256 and SHA512 passed. The probe is not
included in the handoff RPK. Host tests also compare binary/long-key HMAC against
Node crypto and exercise fallback and cleanup.

## Verification

Use the dedicated synthetic-data Vela setup described in
[build 5](band-native-build5.md#native-smoke). The image is not Mi Band firmware
3.2.8 and has a debugger launch wait; launch-to-list timing from it is not a
physical startup measurement. Native graphics, gestures, OTP correctness, BLE,
font rendering and battery behavior still need final hardware acceptance.

```powershell
node scripts/test-band.mjs
node apps/band/scripts/build.mjs --profile capability
node --test tests/rpk-page.test.mjs tests/rpk-archive.test.mjs tests/release.test.mjs
node scripts/native-band.mjs start
# In another terminal; the previous AuthBand process must be gone:
node scripts/native-band.mjs smoke artifacts/AuthBand-capability.rpk
node scripts/native-band.mjs idle artifacts/AuthBand-capability.rpk
```

The local native checks cover eight groups, header/body swipes, six/eight complete
digits, vertical scroll, retained selection/scroll, cancelled drag then tap,
outward exit and relaunch. The idle check waits a real five minutes, including
an assertion at 290 seconds that the app has not exited prematurely. Reports
identify the RPK hash. Neither test is added to default GitHub Actions; the
existing fast Band pipeline and single compact iOS simulator remain unchanged.

## Frozen Candidate

- Source `5d73f1ff4e3891ea1d92dd035202b1c8e5226d25`, clean, versionCode 6.
- `artifacts/final/AuthBand-band-build6-5d73f1f/AuthBand-capability.rpk`, 39,899 bytes.
- SHA-256 `9728337ce5ac27bb1cf75c08c7bf14a71c69100a3e51aea828afca475cd2f03c`.
- Expanded first-page JS: 99,193 bytes. No profiling/probe code in the RPK.
- 80 source tests and 11 package/archive/release checks passed.
- Native smoke passed on this exact hash. Forward group changes were observed
  52-58ms after release, reverse changes 129-226ms, selected details 154-345ms.
  These are emulator samples, not physical FPS or latency guarantees.
- Real idle check passed: still running at 290s, process gone at 301.347s,
  including native process teardown. Normal exit code 0, not a native crash.
- [Band CI](https://github.com/LordierClaw/authband/actions/runs/38125211387) passed.
- [iOS CI](https://github.com/LordierClaw/authband/actions/runs/38125211409) passed:
  Swift/core/transport and the existing compact simulator suite. No extra large
  simulator or repeated IPA exports were scheduled for this repair.
- Native reports, screenshots, contact sheet, diagnostic log, separate RFC probe
  report and a Vietnamese `VERIFY.md` are beside the immutable RPK.
