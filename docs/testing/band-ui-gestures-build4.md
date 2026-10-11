# Band UI And Gesture Revision: Build 4

**Superseded by hardware rejection.** The user subsequently reported unresponsive taps, difficult exit/settings access, delayed swipes and poor layout. The host checks below did not establish native UI usability. See [build 5](band-native-build5.md) for the repair and native-renderer checks.

## Hardware Feedback

The user supplied a build-3 photo from Mi Band 10 firmware 3.2.8: the second line of the code was clipped, account text was split into fragments, and the countdown, back/close buttons and RFC TEST label were unwanted. Horizontal tab gestures still felt less responsive than the band's built-in apps. This revision was implemented and self-reviewed directly, without subagents as requested.

## Findings And Changes

### Detail Layout

The old page explicitly inserted a newline into every OTP. A fixed 106px text box held two lines at 48px without an explicit line height. The hardware image disproves the previous host preview's assumption that this fits. Account identities were also explicitly split every eight code points, including in the middle of words.

Build 4 removes both transformations:

- Two complete code groups sit horizontally in a fixed 180x80px row. Each group has its own single-line text box with 72px line height and 80px height. Six-digit codes use 36px text; eight-digit codes use 28px text. Neither path emits a newline.
- Full issuer and label strings go to native single-line marquees, not fragmented list items. Native start/stop calls are lifecycle-guarded and best effort; a failed marquee call cannot block code viewing or exit. Long names can move horizontally without a JavaScript animation loop.
- Countdown is a thin native progress bar plus a small `m:ss` value, including periods up to 120 seconds. Unknown time masks both code groups, hides the countdown, and retains the actionable sync-time warning.
- Remove the back/close row, generic OTP heading and RFC TEST label from the normal list/detail screens. The fixture/security profile itself is unchanged.
- System back returns from detail. An explicit exit action remains in settings, reached by tapping the group title. The previous header/footer horizontal-swipe-to-exit handlers are removed so those areas belong to tab navigation.

### Gesture Work

The previous swiper covered only 172x314 of the 212x520 screen. Headers, side margins and footer were outside it, and the header/footer had a different horizontal gesture meaning. Tab changes also echoed the selected index back into the native swiper and called `scrollTo` on every mounted list, even when its native position had survived.

Build 4 gives the native swiper the full screen, including each group's title and footer. Native `change` events update app selection without writing back to the swiper's controlled index. That property is set only when recreating/restoring the view. Current/adjacent metadata lists remain bounded to three; prewarming and restoration wait until `swipeend` when native animation events are available. On engines without those events, the existing change/next-tick path still prepares neighbors.

Restoration now runs only for a newly mounted list with a nonzero saved row index. Surviving lists keep their native pixel position. The app ignores account/title clicks while a native tab drag is active. No custom `touchmove` recognizer, animation duration override, per-frame JS handler, or OTP work is added to navigation.

These remove demonstrated app-side interference. They do not prove the remaining native list/swiper arbitration matches the built-in apps' thresholds or frame pacing.

## Platform References

- [Vela text](https://iot.mi.com/vela/quickapp/en/components/basic/text.html): single-line bounds and explicit line height.
- [Vela swiper](https://iot.mi.com/vela/quickapp/en/components/container/swiper.html): native drag animation, change/start/end events and index property. The default animation duration remains controlled by the platform.
- [Vela list](https://iot.mi.com/vela/quickapp/en/components/container/list.html): native scroll callbacks and programmatic restoration.
- [Vela marquee](https://iot.mi.com/vela/quickapp/en/components/basic/marquee.html): full single-line identity and native animation control.
- [Vela progress](https://iot.mi.com/vela/quickapp/en/components/basic/progress.html): thin horizontal countdown track.

## Verification

- `npm test`: 68/68 passed.
- `node --test tests/rpk-page.test.mjs tests/rpk-archive.test.mjs tests/release.test.mjs`: 10/10 passed against the final clean capability/release builds.
- New behavior tests were observed failing before fixes: fixture label removal, single-row code values, countdown formatting, swiper index feedback, unnecessary scroll restoration, animation-phase work, retained restoration references, native marquee errors, and the initially blank cold-start surface.
- Actual compiled-template tests check both complete 6/8-digit code groups, horizontal geometry, one-line styles, headroom for font metrics, full-screen swiper dimensions, removal of normal-screen buttons, full identity bindings and platform back/settings exit paths.
- Host layout inspection uses compiled RPK styles, not a separate visual mockup. Both code groups and `0:30` fit their host-rendered boxes. This remains an approximation, not a Vela font/rendering test; the prior hardware photo is evidence that host screenshots alone are insufficient.
- Self-review found and covered two new risks before freezing: an optional native marquee exception could interrupt lifecycle cleanup, and moving the title into the swiper initially left the cold-start surface blank. Both have passing regression tests.
- Existing crypto, clock repair, vault integrity, public-secret gate, lifecycle and 100-cycle navigation tests remain passing. No iPhone, protocol or storage-schema changes were made.

The compiled build-3 and build-4 page adapters show:

| Native boundary work | Build 3 | Build 4 |
| --- | ---: | ---: |
| Initial `scrollTo` calls, default positions | 3 | 0 |
| `scrollTo` calls, all eight tabs and back | 40 | 0 |
| Controlled-index writes during that traversal | 14 | 0 |
| `scrollTo` calls, return to a still-mounted scrolled tab | 5 | 0 |
| OTP tickers in list | 0 | 0 |

These are call counts, not FPS or milliseconds. Nonzero saved positions are still restored when a list actually has to be recreated.

## Frozen Candidate

- Source commit: `b161b167f7e478caf87b77fbfc9cafdae3ea0d52`.
- Version 0.1.0, build 4, clean tree. Capability RPK size: 46,493 bytes.
- `artifacts/final/AuthBand-band-build4-b161b16/AuthBand-capability.rpk`.
- SHA-256: `ff270e8aa96933582d40bc056edeb6aebf8040f4a827eea1ce0a7ea7098de136`.
- Certificate SHA-256 remains `4a59bed7828884af763c0be1638e9c3eba25810ff3b2e98147270fccd1d5b37e`.
- [CI run 38077776150](https://github.com/LordierClaw/authband/actions/runs/38077776150): all four jobs passed on attempt 1 (band, Swift, iOS compact and large). Exact job evidence is stored beside the artifact in `CI.md` and `ci-result.json`.

This is a public-fixture hardware-test candidate. Native typography, marquee behavior, system back routing, swipe feel and frame pacing on firmware 3.2.8 remain to be verified on the actual band. Do not enable personal-secret transfer based on host tests.
