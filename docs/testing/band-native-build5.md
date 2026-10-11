# Band Build 5: Native UI Repair

## Acceptance Boundary

Build 4 was rejected on Mi Band 10 firmware 3.2.8. Its passing host tests were not evidence of working touch targets or native rendering. This repair was implemented and self-reviewed directly, without subagents.

Build 5 has a native Vela emulator smoke test, screenshots, pixel checks and app-process exit checks. It still requires physical firmware acceptance. Neither emulator timing nor the Node adapter establishes band FPS, touch thresholds, battery impact or BLE behavior. Real-secret transfer remains disabled.

## Frozen Candidate

- Source: `04bbbe735b7f8f1438054cd27f335e1127b216d9`, clean, versionCode 5.
- Local handoff: `artifacts/final/AuthBand-band-build5-04bbbe7/AuthBand-capability.rpk`, 48,039 bytes.
- SHA-256: `117cb54e784c5ee524c01254334f4e4a59d02ff5248bfcbe64cf82d80a02718b`.
- `VERIFY.md`, `native/report.json`, raw screenshots, contact sheet and native log are beside the RPK. The report names this exact hash and passed both navigation and process-restart checks.
- 72 source regressions and 10 package/archive/release checks passed. [Band CI](https://github.com/LordierClaw/authband/actions/runs/38120166368) passed in about 51 seconds including setup.
- Final native samples: 18-22ms after horizontal input release to the observed next-group frame; 241-253ms for the ordinary sampled details; 858ms for the SHA-512 detail; about 1.5s to observe full process teardown. These are emulator measurements with the timing limitations below, not physical-device claims.

## Repairs

- Removed the `_swiping` latch. A cancelled gesture or missing `swipeend` could leave row taps and settings disabled indefinitely. Native controls now decide whether a gesture qualifies as a click.
- Replaced reactive-array reference comparison with a load-generation guard. Vela wraps arrays; reference comparison caused repeated list rebuilding on selection/countdown. A host test with wrapping getters fails before the fix, and native logs now show lists built once per load, not every second or tab.
- All bounded account metadata is prepared once (at most 50 accounts, 8 groups). Tabs do not mount/unmount lists, run OTP work or queue rendering callbacks. Native list widgets remain under a `stack` while detail/settings overlays are active. `show` inside a normal row container was tested and rejected because the next screen occupied a sibling slot on this image.
- Added visible 44px Settings and Exit targets below the swiper. Detail has one back icon. The title is no longer a hidden settings command. Exit reaches the platform even if cleanup throws.
- Removed automatic identity marquees. Detail uses centered static identity, fixed 3+3 or 4+4 code slots and a separate small progress/countdown row. No RFC TEST branding in normal screens.
- Saved nonsecret group/scroll preferences during completed navigation, not only during teardown. Native relaunch originally failed because an exit-time asynchronous write did not complete; the repaired smoke test checks the saved tab after process restart.
- Switched SHA-512 HMAC to pinned StableLib 2.0.1 and imported only the used jsSHA variants. The selected SHA-512 native callback fell from about 1.0s to about 0.75s in the development trace, with a smaller RPK. RFC6238, independent Node HMAC comparisons and the bundled no-BigInt test still pass. SHA-512 is still the slowest detail path; this is not a claim of instant code rendering on hardware.

Native components follow Xiaomi's [swiper](https://iot.mi.com/vela/quickapp/en/components/container/swiper.html), [list](https://iot.mi.com/vela/quickapp/en/components/container/list.html) and [stack](https://iot.mi.com/vela/quickapp/en/components/container/stack.html) contracts. No custom touchmove recognizer or JavaScript animation loop was added.

## Native Smoke

Use a **dedicated synthetic-data VVD**, not an emulator holding personal accounts. Install the official AIoT toolkit/IDE emulator and the Vela Watch 5.0 development image, then create a 212x520 custom device named `Vela_AuthBand_212x520` (240 dpi, 106px capsule radius). Do not use the fixed-resolution watchface image.

The local setup uses `.tools/vela-sdk` and `.tools/vela-emulator`. Other SDK installations can set `VELA_SDK_HOME`, `VELA_EMULATOR_HOME` and `AUTHBAND_VVD`. The emulator's SDK configuration must point at its installed binaries and system image. These large local tools are ignored by Git and are not downloaded by default CI.

```powershell
node scripts/native-band.mjs start
# In a second terminal, after boot; AuthBand must be closed:
npm run build:band -- --profile capability
node scripts/native-band.mjs smoke artifacts/AuthBand-capability.rpk
```

The smoke script installs the actual RPK and injects native mouse press/drag/release through the emulator gRPC controller. It does not invoke app methods or emulate Vela in HTML. It removes only the dedicated fixture VVD's nonsecret `authband-ui` preferences before a run.

Checks include visible account rows (not just a launch title), all eight groups, header/body swipes, 6/8 visible digit silhouettes, long identity, stable identity across a countdown tick, vertical scroll, tap after scroll, preserved scroll/tab on back, settings, pairing entry/cancel, cancelled drag followed by tap, explicit exit, relaunch with the saved group and settings exit. Outputs are PNGs and `report.json` under `artifacts/native-smoke`, or `AUTHBAND_NATIVE_OUTPUT`.

Timing is release-to-first-observed-matching-frame, including gRPC/screenshot overhead, excluding the drag itself. It is **not full gesture duration or FPS**. Process disappearance measures complete teardown, not the time the previous screen stops being visible. This development image waits roughly ten seconds for its debugger during launch; `debugLaunchToListMs` must not be quoted as production app startup latency.

The local image used for this investigation came from Xiaomi's 20250716 Vela Watch 5.0 image and official [Windows emulator](https://github.com/open-vela/prebuilts_emulator_windows-x86_64) commit `6abb840524beef3cfcdbe0f6103817781d86b483`. The ELF debug-section tail was stripped locally after a partial download; all loadable segments were present. Data/system image ZIP CRCs were verified. This was not a full-archive-hash-verified stock image and is not firmware 3.2.8. Its system font lacks some Vietnamese glyphs; screenshots document that limitation, not a completed multilingual typography acceptance.

Wait for the previous app process to exit before reinstalling. Force-stop followed immediately by restart can crash this image's Inspector/GC teardown. The smoke script refuses to reinstall over a running AuthBand VM. Also compare actual PNG pixels/hashes when inspecting repeated screenshots; an inline preview alone is not the assertion.

## CI Scope

- Band paths: fast logic/security regressions, one capability build, compiled-binding and archive checks. Ten-minute timeout, cached dependencies, obsolete runs cancelled.
- iOS paths: Swift/transport regressions plus one compact simulator. Manual `full` adds the large simulator and unsigned IPA exports.
- No emulator download/boot in every GitHub push. Native smoke is a local pre-handoff gate; the report identifies the exact RPK hash.
- A change to shared root tooling or the workflows themselves can legitimately trigger both pipelines. Documentation-only changes do not rebuild apps.

## Physical Check

Install the immutable build-5 capability RPK supplied with its hash/report, using the same installer as the previous build. It contains public test accounts only.

1. Open, swipe across groups using both the title and rows, then tap a row without repeated tapping.
2. Check a six-digit code and an eight-digit code. Each must stay on one line with every digit visible; long names must not overlap it.
3. Return, scroll, open another account and return again. The group and scroll position should remain intact.
4. Use the bottom-left Settings icon, open pairing, cancel, and return with its back icon.
5. Use the bottom-right Exit icon; reopen and confirm the saved group. Also verify the firmware's native back gesture separately.

Do not transfer personal keys until hardware/security acceptance and explicit release approval. The final report and screenshots travel with the RPK so the user is verifying firmware behavior, not serving as the first UI tester.
