# Band Performance Repair

> **For agentic workers:** Use superpowers:executing-plans. The user requested inline implementation and independent final review.

**Goal:** Remove reproducible CPU/reactive-render amplification in the RPK reported unusably slow on Mi Band 10 firmware 3.2.8.

**Architecture:** Keep horizontal group tabs and native vertical lists. Index the snapshot once, cache OTP results by account/time window, update stable row objects, and mount only the active list. Suspend code work outside code/detail screens and stop before exiting.

**Tech Stack:** Vela Quick App, existing jsSHA, Node behavioral tests and packaged-page VM tests. No crypto replacement or protocol change.

**Spec:** User's lag/slow-exit report and request to study existing GitHub apps; existing approved group/list UX.

## Constraints

- Keep all 50 public sample accounts, 8 groups, SHA1/256/512 and 6/8 digits. Do not hide the issue by reducing the fixture.
- Preserve signing certificate, vault format, authentication and real-secret release gate.
- Do not equate host timing or a VM pass with real-device frame rate or crash resolution.
- No private data in diagnostics; no changes to read-only BlueBand references.

## Review Focus

- Cache invalidation on clock distrust, rollover, snapshot reload and hide.
- Late native scroll events from a tab no longer visible must not move another group's position.
- Detail/settings must not keep invisible list timers/HMAC work active.
- Queued timer/load callbacks after exit must never restart work.
- Native list restoration must not create a render/scroll feedback loop.

## Evidence And References

Baseline `aae0f2d`: 4 initial visible rows cause 120 OTP calculations and 30 new group arrays over seconds 30..59. Another 100 same-row scroll callbacks cause 400 OTP calculations and 100 new group arrays.

- BandTOTP-Band `3719a1691dc67c9f35f13eb4711ec5e12b334f55`: recomputes tokens at 30-second boundaries, explicit exit. Do not adopt its 10ms progress loop, missing hide cleanup, SHA1-only policy or plaintext sync.
- mi_band_mfa `b536379b76a13e33d18648d97fdca9370d47e11c`: bounds visible tokens to 1/2, 1Hz ticker, hide/destroy cleanup. Do not copy its custom SHA1 implementation or config transport.
- https://iot.mi.com/vela/quickapp/en/guide/best-practice/business.html recommends lazy swiper content, reducing dynamic styles/reflow and bounded initial lists.
- https://iot.mi.com/vela/quickapp/en/components/container/list.html documents scroll offsets/state and scrollTo behavior.

## Task 1: Viewer Hot Path

Files: `apps/band/src/logic/viewer.js`, `apps/band/test/viewer-performance.test.mjs`, `scripts/benchmark-band.mjs`.

- [x] Add tests counting real secret decodes (one per HMAC), stable published list identities, row-boundary scrolling, mixed OTP periods, reload and clock invalidation. Observe RED.
- [x] Index/order once per load; retain bounded OTP values until their counter changes; retain row identity and skip same-position events. Keep decoded key zeroing.
- [x] Use `setScreen(screen, detailID)` to select visible work and an aligned one-shot scheduler to avoid redundant polling. Test pause/detail/wake/late timer behavior.
- [x] Run `npm test`; capture comparable operation counts, not claimed device FPS.

## Task 2: Native Page Lifecycle And Exit

Files: `apps/band/templates/index.ux`, `apps/band/test/page-performance.test.mjs`, `apps/band/test/page-harness.mjs`, `tests/rpk-page.test.mjs`.

- [x] Reproduce root-array replacement, settings ticking, duplicate ready/show load, stale-tab events and root-back timer leak. Observe RED.
- [x] Mount active list only; apply leaf changes without reassigning root arrays; preserve scroll positions. Integrate visible-screen selection.
- [x] Provide explicit exit control and header/footer swipe exit separate from content group swipes. Stop work synchronously before exit; keep internal back navigation.
- [x] Run source-page tests and compiled RPK behavior tests, including hide/show/reload and exit during load.

## Task 3: Delivery

- [x] Run all band, package/archive and release-policy tests; independent review; fix any actionable regressions. 52 source tests and 8 package/policy tests pass; both Important review findings have RED/GREEN regressions.
- [x] Commit/push scoped repair, build signed RPK with unchanged local certificate and freeze a new uniquely named artifact plus SHA-256. Code commit `09676a9`; Actions run `38070570264` passes all four jobs after one compact XCTest-runner bootstrap retry.
- [x] Record research, benchmark results and remaining device verification in `docs/testing/band-performance-repair.md`.
- [x] Prepare the new RPK handoff; iPhone is unchanged. Final provenance and CI evidence are in `artifacts/final/AuthBand-band-build2-09676a9`. Hardware acceptance remains pending user verification.
