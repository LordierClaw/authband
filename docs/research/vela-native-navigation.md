# Vela Native Navigation: Exit, Back And Paging

Researched 2026-10-16 for band build 10, after Hải reported that build 9 exits
immediately without the band's swipe-out animation and that tab swipes still feel
sluggish on Mi Band 10 firmware 3.2.8.

## Sources

- Vela page lifecycle: <https://iot.mi.com/vela/quickapp/en/guide/framework/script/lifecycle.html>
- Vela router API: <https://iot.mi.com/vela/quickapp/en/features/basic/router.html>
- Vela swiper component: <https://iot.mi.com/vela/quickapp/en/components/container/swiper.html>
- Vela manifest: <https://iot.mi.com/vela/quickapp/en/guide/framework/manifest.html>
- Vela business best practice (performance): <https://iot.mi.com/vela/quickapp/en/guide/best-practice/business.html>
- Xiaomi band dev guide (community, Chinese): <https://github.com/KaiTeeDreamChai/xiaomi-band-dev-guide>,
  especially `docs/04-pitfalls-and-solutions.md` and `docs/03-ui-and-interaction.md`
- QRWallet, a Band 9/10 quickapp: <https://github.com/SirWant/QRWallet>

## Findings

### Back and exit

- The official lifecycle doc says `onBackPress` is "triggered when the user swipes
  right to return or clicks the physical back button". Returning `true` cancels
  the default; anything else lets the system return to the previous page. On the
  root page that is the app exit.
- The community guide uses exactly this to exit: `return false` lets the back
  gesture through and exits the app. Neither source documents `$app.exit()`.
- The community guide (pitfall 8) says the system back gesture only takes swipes
  that start within about 20px of the left edge. A right swipe that starts in the
  middle of the screen never reaches `onBackPress`.
- Router has no transition or animation options (`push`, `replace`, `back`,
  `clear`, `getLength`, `getState`, `getPages`). The manifest has no
  transition or swipe-back settings. Transitions belong to the firmware.

Consequence for build 9: an edge swipe on the first tab goes through the system
(`onBackPress` returns `false`). A mid-screen swipe was caught by the row fallback,
which called `$app.exit()`. On the emulator that call goes straight to
`notify AMS activity finish`, while `router.back()` on the root page runs the
framework's normal back path: `PageNavigator::back`, page `onHide`/`onDestroy`,
"notice app destroy", then the AMS finish. That is the same path a system back
takes when `onBackPress` returns `false`. Whether the firmware animates it cannot be
seen on this emulator image, which draws no transitions.

### Paging and performance

- Swiper `duration` defaults to a value "calculated dynamically from finger
  speed"; there is no curve option. `enableswipe`, `previousmargin`,
  `nextmargin` and `indicator-*` styles are the only other knobs.
- Xiaomi's performance guide recommends: keep only about three swiper children
  (visible plus neighbours) for large galleries and swap data as the user swipes;
  paginate lists over 10 items; avoid rendering lots of data at once; minimise
  `border-radius`, nesting, dynamic style changes, reflows and repaints.
- The community guide warns that frequent `router.push` can exhaust band RAM,
  because every page has its own native view context, and recommends a
  single-page state machine. Our measurements (30 code open/back cycles, heap
  flat after the first open) show the code page is freed on back. The page stack
  never exceeds two pages.
- QRWallet ships plain ES6 instead of `--enable-jsc` bytecode, which it ties to
  black-screen crashes on HyperOS 2 / Band 10. This supports not using bytecode.
- `display.backgroundColor` defaults to white for the whole app window. AuthBand
  never set it; every page painted its own black background.

### Not found

No source documents a native-style horizontal pager other than `swiper`, or any
setting that makes swiper drags cheaper. No open-source band app with a measured
smoother pager was found.

## Decisions For Build 10

1. Exit: keep `onBackPress` returning `false` on the first tab. Replace the
   mid-screen fallback's `$app.exit()` with `router.back()`, so both gestures use
   the framework's normal back/exit path. `$app.exit()` stays only for idle expiry.
2. Set `display.backgroundColor` to black so no white window shows during any
   firmware transition.
3. Paging: keep the native swiper (horizontal tabs, Hải's choice). Follow Xiaomi's
   guidance: only the active tab and its neighbours keep a mounted list, with at
   most three lists (Xiaomi suggests about three swiper children). Far tabs show
   their title only, and lists are mounted/unmounted only after the finger has been
   up for a while, never during a swipe. No `border-radius` in the swiper.
   Whether this feels smoother can only be judged on the band.
