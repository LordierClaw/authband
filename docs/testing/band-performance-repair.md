# Mi Band Performance Repair - 2026-10-11

## Incident

The user tested the capability RPK from commit `aae0f2d` on Mi Band 10 firmware 3.2.8. The app was nearly unusable due to lag, and a horizontal exit gesture took a long time or possibly ended in a crash. There is no native crash log, so crash versus delayed exit is not established. Previous desktop tests did not establish device usability.

## Research

Read the source of both repositories, not just their README files. They are references, not dependencies; no code was copied.

- [BandTOTP-Band](https://github.com/leset0ng/BandTOTP-Band/blob/3719a1691dc67c9f35f13eb4711ec5e12b334f55/pages/index/index.ux), MIT: updates the stored OTP only on the 30-second boundary, uses a native list and explicit exit. Adopt the counter-window reuse idea. Do not adopt the 10ms progress interval, absent hide/destroy cleanup, SHA1-only calculation or plaintext configuration transfer.
- [mi_band_mfa / BandOTP](https://github.com/lin945/mi_band_mfa/blob/b536379b76a13e33d18648d97fdca9370d47e11c/src/pages/index/index.ux), Apache-2.0: calculates only the one/two tokens displayed, uses a 1-second timer and stops it on hide/destroy. Adopt bounded visible work and lifecycle discipline; preserve AuthBand's requested group tabs and vertical account list. Keep the existing vector-tested crypto library instead of adopting its custom SHA1 implementation or configuration transport.
- Xiaomi's [memory guidance](https://iot.mi.com/vela/quickapp/en/guide/best-practice/memory.html) recommends updating objects in place, keeping non-UI state out of observable data, and clearing timers. Its [business guidance](https://iot.mi.com/vela/quickapp/en/guide/best-practice/business.html) recommends lazy swiper content and reducing reflow. AuthBand previously violated the relevant in-place/lazy-content recommendations.
- Xiaomi's [list API](https://iot.mi.com/vela/quickapp/en/components/container/list.html) and [event parameter rules](https://iot.mi.com/vela/quickapp/en/guide/framework/template/event.html) informed native scroll-state filtering and group-ID event binding.
- Re-read BlueBand's local lifecycle and performance-trace practices. No changes to either reference repository or the verified transport bytes.

## Confirmed Software Causes

1. Every pixel-level scroll callback forced a full render, including HMAC for four visible rows even when the first visible row had not changed.
2. Every countdown second recomputed the same four OTP values, although a value is constant throughout its counter window.
3. Every render sorted/filtered the snapshot and replaced all eight groups and all 50 row objects. The compiled template exposed eight native lists at once.
4. Settings and pairing screens retained the OTP timer; hidden list work continued and could overwrite settings status.
5. The ordinary ready/show sequence started two vault loads. Root back waited for platform lifecycle callbacks to stop code work, and content swiping had no separate explicit exit control.

These are demonstrated amplification/lifecycle defects consistent with the report. Their removal is not proof that every native lag/crash cause has been eliminated.

## Repair

- Index and order the snapshot once per load. Keep group/row objects stable during countdowns; assign only changed row values.
- Cache bounded OTP results by account and validity window. Do not cache decoded key bytes. Clear the cache on hide/reload and loss of clock trust. Preserve SHA1/256/512 and 6/8 digits, including mixed 15..120-second periods.
- Mount only the active native list; keep the eight lightweight swiper shells. All 50 sample accounts remain accessible, not reduced to make the test pass. The active fixture group contains 6 or 7 rows; production validation still permits 20 per group.
- Ignore same-row scroll events and stale events from inactive tabs. Distinguish real scrolling from the initial/programmatic zero-offset event so restoration cannot loop or jump to the top.
- Use one timer aligned to the next corrected second, no 250ms polling. Pause in settings/pairing/error, calculate one account in detail, cancel on hide/destroy/exit. Guard queued callbacks with lifecycle and timer generations.
- Exit via the X control or a horizontal swipe on the header/footer. The middle content retains horizontal group navigation. Root back exits explicitly; internal back returns to the previous app view. Pending disk reads cannot restart a closed viewer.
- Increment only the band versionCode to 2; iPhone version and binaries are unchanged. Same band package, local signing certificate, storage schema, security gate and sync protocol.

## Measurements

Reproduce: `node --jitless scripts/benchmark-band.mjs aae0f2d artifacts/performance/benchmark-jitless.json`.

| Scenario | Before | After |
| --- | ---: | ---: |
| OTP calculations, same 4 rows over seconds 30..59 | 120 | 4 |
| New group arrays, same 30 seconds | 30 | 1 |
| Account row records published at once, initial fixture group | 50 | 7 |
| OTP calculations, 100 scroll callbacks within one row | 400 | 0 |
| Publish calls, those 100 callbacks | 100 | 0 |
| OTP calculations, scroll indices 1,2,3,2,1,0 | 24 | 3 |

The compiled-template host traversal changed from 372 elements / 8 lists / 50 rows to 67 elements / 1 list / 7 rows for the initial fixture group. These are adapter traversal counts, not physical native view allocations.

The script also reports host CPU medians with JIT disabled. These are not band FPS, native heap use, touch latency or exit duration, and must not be presented as such. Compiled-template tests exercise actual RPK bindings/conditions with a minimal host adapter, not a native renderer.

## Verification And Handoff

- Regression tests were observed failing before fixes: HMAC/cache counts, root-array assignments, duplicate load, inactive lists, settings timer, exit cancellation, late scroll/click events and corrected-clock timer alignment.
- Existing crypto, persistence, sync security and release-policy tests remain required.
- Source-page tests include 100 group/detail/settings/hide/wake cycles with one active ticker and one group's data.
- Packaged-page tests exercise compiled list/change/scroll/exit bindings and preserve full long-label detail behavior.
- Build emits existing generated/vendor unused-symbol and uninjected-template lint warnings; compilation and artifact verification must still succeed. No new dependency or advisory workaround is introduced here.
- `npm test`: 52/52 passing after the review fixes, including both newly failing regressions. Both capability/release RPK builds pass; `node --test tests/rpk-page.test.mjs tests/rpk-archive.test.mjs tests/release.test.mjs`: 8/8 passing. Final commit, hashes and CI evidence are included with the frozen artifact.

### Final Artifact And CI

- Code commit: `09676a9ec72afa922041d13dcc2e71c7777d8a7a`, pushed to `feat/authband`.
- Frozen candidate: `artifacts/final/AuthBand-band-build2-09676a9/AuthBand-capability.rpk`, 45,737 bytes, build 2, built from a clean tree.
- RPK SHA-256: `ff0aa720ef1cd5503cb5ce81d5d008878384cd343a2a8895d160739c4855b108`.
- DER signing-certificate SHA-256 remains `4a59bed7828884af763c0be1638e9c3eba25810ff3b2e98147270fccd1d5b37e`.
- [GitHub Actions run 38070570264](https://github.com/LordierClaw/authband/actions/runs/38070570264): band, Swift, iOS large and iOS compact all pass at attempt 2. Only the compact job was retried, with no source or test changes.
- Attempt 1 compact unit tests passed, but the XCTest UI runner crashed during bootstrap (`handleStalledWait`) before executing the UI cases; diagnostic collection then timed out after 600 seconds. The exact same code passed the retried job. This is recorded, not hidden as an uninterrupted green run.
- `testCompleteFileProtectionOnDevice` remains skipped on simulators by design; physical-device file protection is not established by these CI results. Band hardware acceptance likewise remains pending.
- The iPhone source/binaries are not part of this band repair handoff. The previous IPA remains compatible; do not enable real-secret transfer based on these host tests.

## Independent Review

The independent read-only review covered `aae0f2d..d7337df`. It found two Important issues, no Critical or Minor findings. Both were reproduced before repair:

1. A detail tap during an asynchronous reload could repopulate the cache from the old snapshot. Accepting a replacement snapshot with the same account ID then retained the old secret's result. The regression observed `287 082` instead of `241 063`; accepting a load now clears the cache again after its lifecycle-generation check. The test passes.
2. Snapshot validation allows case-insensitive UUID references, but the new account index used raw group IDs. An uppercase account reference to a lowercase group ID crashed the load with `undefined.push`. Internal index keys and lookups now consistently use lowercase without rewriting published IDs. The regression covers load, scroll and tab restoration and passes.

No findings were deferred. Native observer delivery, scroll clamping/restoration timing, gesture propagation, and a delayed event from an older instance of a rapidly revisited tab still require device testing; the reviewer did not establish an additional defect in those paths. The repaired build is a hardware-test candidate, not a hardware PASS.

## Device Retest

Use only the newly handed-off build-2 capability RPK. Update in place through the same trusted installer; its signing identity has not changed. Do not erase pairing/vault data merely to apply this update. The iPhone is not needed for this test.

1. Open offline, leave it displaying codes for 60 seconds, then swipe through all groups and scroll from top to bottom and back. Compare responsiveness both just after launch and after several minutes.
2. Check at least one code rollover while scrolling, and open/close a long-label detail. Six/eight-digit codes and all algorithms remain in the fixture.
3. Open settings, wait 30 seconds, then go back. Status should stay stable and controls should respond immediately.
4. Exit with X, reopen, then exit using a horizontal swipe across the title/footer (not the center tab area). Repeat after sleep/wake and after five minutes of use.
5. Record time to first code, any freezes, exit delay and whether the band returns to its launcher normally. A short video of public samples is useful if it still fails. Never include OTP secrets, Xiaomi AuthKey or pairing keys.

Hardware responsiveness, native memory, battery and crash-free operation remain NOT RUN until the user verifies this candidate. Do not transfer personal OTP keys to the band; that gate stays closed.
