# Mi Band List-First Build 3

## Approved Scope

After testing build 2 on Mi Band 10 firmware 3.2.8, the user still reported delay on launch and group changes. The approved change trades one tap for less work on the navigation path: show account identities first, then compute only the selected account's OTP. This is a hardware-test candidate, not a claim of measured instantaneous startup.

- Static issuer/label list, approximately four 76px rows in the 314px viewport. No codes, progress meters, countdowns or OTP timers in the list.
- Horizontal group tabs and vertical scrolling remain. Only current and adjacent groups are mounted, at most three. Neighbor preparation is deferred and rapid requests are coalesced.
- Detail shows one code as 3+3 or 4+4 digits across two lines, seconds remaining, explicit back and exit controls. Back preserves the group and top row index, not exact fractional pixel position.
- Same 212x520 dark capsule layout, package, certificate, storage schema, protocol and real-secret gate. iPhone implementation is unchanged.

## Implementation

`Viewer.show()` loads and indexes the validated snapshot once, publishes metadata for the active group and does not start a ticker. Scrolling only records the current row index. Tab changes reuse prepared row objects and do not perform HMAC. Entering detail computes one account and reuses the result until its counter window expires; hide, reload and clock distrust clear cached codes. Decoded key bytes are still cleared immediately.

Startup checks the erase marker first. Vault validation, clock and nonsecret preferences are then read concurrently. Pairing-state reads and interconnect initialization are queued after successful list publication. The ordering removes them from the first-list path; `$nextTick` is not evidence of an actual painted native frame.

Malformed clock JSON is treated as unknown time, not as an unreadable vault. Codes remain masked until an authenticated time sample succeeds. This recovery correction was required by the independent review. Vault integrity failures and erase markers still fail closed.

## Evidence

Compared with build 2 (`b7c8457` source baseline), using the same public 50-account fixture:

| Scenario | Build 2 | Build 3 |
| --- | ---: | ---: |
| OTP calculations, list idle for seconds 30..59 | 4 | 0 |
| Active OTP tickers in list | 1 | 0 |
| OTP calculations, scroll down and back | 3 | 0 |
| Publish calls, that scroll sequence | 6 | 0 |
| OTP calculations, visit all groups and return | 32 | 0 |
| OTP calculations, open one code for that 30s window | 4 | 1 |
| Native callback rounds before first list, empty fixture install | 6 | 4 |
| Native callback rounds before first list, saved fixture vault | 5 | 3 |

Reproduce operation counts with `node --jitless scripts/benchmark-band.mjs b7c8457 artifacts/performance/list-first-benchmark.json`. Startup evidence compares the actual immutable build-2 RPK and final build-3 RPK with deferred native-read callbacks. It counts dependency rounds, not elapsed device time. Prewarming means up to three groups' metadata are published; it does not mean three groups' codes are calculated.

Host layout inspection used the compiled RPK template and source CSS in a 212x520 capsule approximation. Six/eight-digit code containers fit at 172x106 CSS pixels without host overflow. This is not the Vela renderer, does not reproduce native fonts, and does not establish touch performance or clipping on the band.

## Verification

- New list/timer/navigation tests were observed failing before the redesign. The rapid-navigation test initially observed 50 queued preparations; coalescing reduces that to one.
- `npm test`: 58/58 passed after review fixes.
- `node --test tests/rpk-page.test.mjs tests/rpk-archive.test.mjs tests/release.test.mjs`: 8/8 passed against the clean final builds.
- Both capability and release builds succeeded. Existing vendor/generated-symbol and uninjected-template lint warnings remain; no new dependencies were introduced.
- Coverage includes all 50 public accounts across eight timestamps and mixed periods, independently compared with Node HMAC; 100 navigation/settings/hide/wake cycles; asynchronous reload, stale taps/timers, clock distrust, full label content, erase gating and actual compiled-template event bindings.
- The native-list adapter now omits unmounted elements and clamps programmatic scroll feedback to approximate content extent. Assertions cover row-index restoration, not native pixel layout or event ordering.
- Real-secret transfer remains disabled. The capability fixture contains only public test secrets.

## Independent Review

A read-only reviewer examined `b7c8457..bbf16b2` and requested one Important correction: deferring recovery services until successful viewer loading made malformed clock JSON block authenticated repair. The valid vault was preserved on disk but no connection started.

The new test reproduced `mode=error` before the fix. After the fix it proves: a valid enrolled vault opens with masked codes; a real protected-channel handshake and authenticated `time.sample` restore code output; vault bytes remain unchanged. The reviewer independently reran 29 focused page/viewer/lifecycle tests and reviewed `952ad0a`, closing this finding and the minor unrealistic-scroll-test issue. No actionable findings remained within that review's scope.

The verdict was ready for a public-fixture hardware trial. Native startup latency, FPS, heap use, gesture timing, battery use and crash-free behavior remain unverified.

## Final Candidate

- Code commit: `952ad0a04c16c0d427497915d2632d710b4e4cef`, pushed to `feat/authband`.
- Frozen RPK: `artifacts/final/AuthBand-band-build3-952ad0a/AuthBand-capability.rpk`.
- Version 0.1.0, build 3, 45,982 bytes, built from a clean tree.
- SHA-256: `8f451d4ee0bd564fc4f6d779f0679896c656d99007bebdd0bf7dea5626e5d7cf`.
- DER certificate SHA-256: `4a59bed7828884af763c0be1638e9c3eba25810ff3b2e98147270fccd1d5b37e`, unchanged from the previous local candidate.
- CI: [GitHub Actions run 38075146361](https://github.com/LordierClaw/authband/actions/runs/38075146361): band, Swift, iOS compact and iOS large all passed on attempt 1. Exact job evidence is recorded in the frozen candidate's `CI.md` and `ci-result.json`.
- Both iOS simulators intentionally skip `testCompleteFileProtectionOnDevice`; their successful runs do not prove file protection on a physical passcode-protected iPhone.

Only this capability RPK is handed off for the performance retest. The release-profile build was verified separately; it is not a second install candidate. Updating in place must not require clearing the vault or pairing. See `VERIFY.md` beside the RPK for the five-minute firmware 3.2.8 test sequence.
