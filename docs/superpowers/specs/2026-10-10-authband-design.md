# AuthBand requirements and architecture

Date: 2026-10-10

Status: approved explicitly by the user on 2026-10-10. The implementation plan requires its own review. Neither app has been implemented yet.

## 1. Intended outcome

Provide an iOS 27 authenticator manager and a Xiaomi Smart Band 10 app that lets the user read the right code quickly. Account setup and organization happen on the phone; everyday code access happens directly on the band.

Confirmed by the user:

1. The band generates codes offline, including when the phone is away or Bluetooth is disconnected. The user accepts that OTP secrets must be stored on the band.
2. A tab represents a group of accounts. Horizontal swipes change groups; vertical scrolling reveals the accounts in a group.
3. Group names are editable in the phone app.
4. The phone supports import from Google Authenticator and ordinary authenticator setup by scanning QR codes or entering details manually.
5. The design is dark, minimal, lightweight, and fast. Band content must fit the rounded top and bottom of its display.
6. Use blueband-ios as the protocol baseline and experience from blueband-map. The baseline was re-read after the user restored source files.

Success means a provisioned band can open the account list and show current codes without a connection screen, phone request, or network call.

## 2. Approaches and selected direction

| Approach | Consequence | Decision |
| --- | --- | --- |
| Offline TOTP on the band | Immediate access, no phone dependency; requires local secret storage and trustworthy time | Selected by the user |
| Live codes sent by the phone | Avoids permanent OTP-secret storage on the band; depends on Bluetooth and phone execution | Does not meet the confirmed offline requirement |
| Precomputed future codes | Works only for a limited provisioned period; eventually requires the phone | Not selected because it does not provide persistent offline access |

Use native SwiftUI on iPhone and native Vela components in one RPK page. Transmit account data and group configuration during explicit synchronization; render and compute codes locally on the band.

## 3. Approved v1 boundaries

These defaults were included in the written design approved by the user:

- One iPhone vault and one paired band. The phone is the source of truth for account data and ordering.
- iOS deployment target 27.0. Verify with an iOS 27 simulator and physical device; do not inherit the baseline's 17.0 target accidentally.
- TOTP using SHA-1, SHA-256, or SHA-512; 6 or 8 digits; positive integer periods of 15 through 120 seconds, default 30. Unsupported parameters are reported explicitly.
- HOTP, Steam-specific codes, passkeys, push-approval authenticators, cloud account sync, and multiple bands are outside v1. Never silently convert these formats to TOTP.
- Initially validate up to 100 phone accounts, with up to 50 explicitly selected for the band across 8 groups. A band group contains at most 20 accounts. These are acceptance limits to test, not measured firmware limits.
- All UI labels are Vietnamese. Issuer/account names retain their original Unicode text.
- No app-specific PIN prompt on every band opening by default. iPhone vault access uses Face ID or the device passcode; hide sensitive UI when the app becomes inactive.
- No background BLE dependency. Synchronization is explicit and foreground; disconnect afterward so Mi Fitness can resume ownership.
- No RPK installation or Xiaomi AuthKey extraction feature in v1. Reuse the established installation and user-supplied AuthKey workflow.

## 4. Phone workflows

### Account list

Open to the account list after vault unlock. Show issuer, distinguishing account label, current code, and remaining validity. Search and group filtering are directly accessible. Tap a code to copy it locally with an expiry; do not place codes on Universal Clipboard. Use SF Symbols for tools and native accessible controls.

Rename, move, reorder, and delete accounts. Deleting an account on the phone does not claim to erase an offline band immediately: retain a pending synchronization state until the band confirms the replacement vault.

### Add or import

Provide three clear paths: scan QR, import QR from an image, and enter a secret manually. Image import covers QR codes available on the same phone. Process camera frames and selected images locally; do not upload or persist raw QR contents in logs or telemetry.

Recognize ordinary `otpauth://totp/...` setup and Google `otpauth-migration://offline?...` export codes. Google import collects and validates all parts of a migration batch, allows rescanning identical parts, rejects conflicting parts, and shows progress. Do not silently save an incomplete batch.

Before committing, preview accounts, duplicates, unsupported records, destination group, and which accounts will be available on the band. Default newly imported accounts to phone-only until selected for the band. Import does not modify or delete the source Google Authenticator data.

Duplicate detection compares normalized secret bytes and OTP parameters within the unlocked vault; matching display names alone are insufficient. Never store a secret fingerprint in telemetry. A malformed entry must be visible as an import error rather than quietly omitted.

### Groups and band management

Create, rename, delete, and reorder groups; reorder accounts inside each group. Each account belongs to one group in v1. Deleting a populated group moves its accounts to the default group without deleting secrets. The default group cannot be deleted.

The band page shows the selected device, explicit connection state, selected account count, pending changes, last confirmed revision, and time-check status. It supports Connect, Sync, Disconnect, and an explicitly confirmed erase operation. Losing a phone or band must not trigger an automatic destructive reset.

## 5. Band interaction and visual layout

Use one page with a horizontal `swiper` and a vertical native list in each group. Do not navigate to another route per group. Disable autoplay and wraparound. Preserve the last active group and its list position; if removed, fall back to the first available group.

The first screen shows codes immediately from committed local data. Link errors update synchronization status, not the offline viewer. On an empty band, show a brief provisioning state. Diagnostic build information belongs in a secondary status view, not above the codes.

Visual direction:

- Black background, white codes, neutral gray labels, restrained mint selection/progress, amber near expiry, red only for errors. No gradients, blur, large decorative cards, or full-screen raster streaming.
- Fixed 212 by 520 layout. Begin with the measured mask from blueband-map, then verify text and gestures on hardware.
- Group title centered around y=46 through 78 within x=40 through 172. Shorten visually with an ellipsis when necessary; retain the full name on iPhone.
- Account list inside x=20 through 192 and y=100 through 414. Use rows around 136 pixels high, so two complete accounts are readable without scrolling.
- Each row contains issuer, distinguishing account label, a large tabular code, and a thin validity indicator. Six-digit codes can use `123 456`; eight-digit codes use `1234 5678` at a smaller fixed size or a deliberate two-line layout if native font metrics require it. Never truncate OTP digits.
- Small page-position indicator centered in x=76 through 136 and y=454 through 470. Do not place actions or labels in rounded corner regions.
- A tap may expand an account to a large-code view; normal list browsing already shows the code and does not require this extra action.

Calculate the current code from time, not by incrementing a stored code or decrementing a timer indefinitely. Recompute on show/resume, a time change, and the OTP period boundary. Stop timers when hidden or destroyed. Only visible rows require second-by-second validity updates.

Long Vietnamese text, long email labels, empty groups, 8-digit codes, first/last groups, diagonal swipes, and a native back gesture are explicit layout and device cases.

## 6. Architecture and source reuse

```text
SwiftUI + camera/photo QR input
               |
       AuthBand domain core
       /        |          \
 Keychain   OTP/import   Sync coordinator
                           |
             BlueBand protocol/session adapters
                           |
               Xiaomi ThirdPartyApp bridge
                           |
                 Vela AuthBand page
              /           |          \
       local vault     OTP runtime   group viewer
```

Keep OTP rules, import decoding, group ordering, and synchronization state testable without SwiftUI or CoreBluetooth. Apple-specific Keychain/camera/Bluetooth adapters remain in the iOS app. The band has separate source modules for testing, with a build step that emits firmware-compatible code without unsupported runtime module loading.

The new repository must build independently of absolute `E:/code/...` paths. Import only the required baseline modules, retain applicable licenses and provenance, and preserve Xiaomi frame/authentication vectors. Use a new app/RPK identity such as `dev.lordierclaw.authband` and `dev.lordierclaw.authband.band`.

Take BLE/authentication/ThirdPartyApp behavior from blueband-ios, and the maintained package boundaries, fingerprint continuity, bounded ACK handling, and display mask from blueband-map. Do not reuse its location permission or navigation pipeline.

## 7. Secret handling and unresolved platform capability

The offline decision authorizes storing selected OTP secrets on the band. It does not establish hardware-backed protection. A person with access to the unlocked band can read displayed codes; extraction resistance of its application storage is unverified. Erasing an offline or lost band cannot be guaranteed remotely.

On iPhone, protect the vault with device-only Keychain material and file protection, keep secrets out of UserDefaults, and exclude plaintext secrets from backups, diagnostics, pasteboard setup flows, and fixtures. Use system cryptographic primitives. Imported QR data remains transient.

Xiaomi's current support table marks `system.crypto` unsupported on Band 10. Offline OTP therefore needs an established, pinned JavaScript implementation of HMAC/hash primitives, bundled for the actual engine. Do not invent SHA/HMAC implementations or assume browser WebCrypto, Node APIs, BigInt, or a native secure keystore exists.

The inherited Xiaomi command transform is also insufficient as the sole protection for OTP provisioning: it uses the protocol-specific CTR construction described in the research note. Preserve transport compatibility and add protection above it.

The first technical milestone must resolve the application enrollment and encryption design with independent vectors and actual firmware capability evidence. It must specify where the band obtains private key material/entropy, how the user verifies the initial peer, how fresh nonces and replay protection work, and what persists after restart. A key encrypted by another key stored beside it is not claimed as extraction protection.

If the runtime cannot supply secure key generation, the design must use a reviewed out-of-band provisioning mechanism or report that real-secret synchronization is blocked. Do not silently send a pairing key or OTP secrets through the inherited transport alone. UI and OTP development can continue with public RFC test secrets while this prerequisite is resolved. The exact enrollment screen is intentionally conditional on this feasibility result; it is not being presented as an implemented security protocol.

## 8. Synchronization and persistence contract

The phone owns a monotonically increasing vault revision and an explicit band selection. Synchronization sends a bounded snapshot of selected accounts, groups, ordering, and OTP parameters. It does not stream codes every 30 seconds.

Use an application schema version, transaction ID, revision, ordered chunks, and authenticated completion. Begin with one outstanding chunk and a conservative 512-byte encoded-envelope ceiling. Compute payload capacity after all encryption/encoding overhead; raw bytes and encoded JSON bytes are different budgets.

Separate four events: SPP receipt, application receipt, complete snapshot validation, and durable commit. Only a verified durable-commit response permits the phone to report synchronized. Duplicate retries must not apply twice; stale transactions and callbacks cannot replace a newer committed revision.

The band stages a new snapshot while retaining the current one. It validates lengths, algorithm support, group references, account counts, transaction identity, integrity, and revision before publication. Persistence uses a recoverable journal or slot scheme whose crash behavior is verified; do not assume `file.move` or `storage.set` is atomic from API names alone.

Disconnect, timeout, full storage, process exit, and corrupted staging data keep the last valid committed vault available. After reconnect, query the committed revision to reconcile a lost completion response. A delete or erase is complete only after the corresponding durable revision is confirmed. Never resurrect an acknowledged deleted account by falling back to an obsolete slot; invalid post-delete state must fail closed.

## 9. Time correctness

Use UTC Unix time for TOTP, independent of local timezone. Check the band time against the phone during synchronization, bound the round-trip uncertainty, and persist an application time offset only if it can be applied consistently across lifecycle transitions.

Recompute immediately after wake; do not show a cached pre-sleep code. Detect implausible/backward time and known clock discontinuities. Mark the clock untrusted and require a time check when correctness cannot be established. The app cannot detect every undetectable hardware clock error while fully offline, so drift must be measured over an extended device test.

Do not present an expired code during an asynchronous recalculation. The validity indicator and the code must correspond to the same account period and timestamp.

## 10. Development sequence

This is the proposed sequence for the detailed implementation plan after design review.

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| M0: Device capability and protection | Minimal RPK with public TOTP fixtures, persistence/restart check, swipe/list check, and a concrete secure-enrollment proposal | Firmware-compatible bundle; RFC vectors; physical checks for unsupported APIs, gestures, clock, and restart; no real secrets provisioned |
| M1: Portable domain core | TOTP, strict Base32/URI parsing, Google migration batches, group/account model | Independent vectors, malformed input cases, duplicate/conflicting batch cases, explicit unsupported entries |
| M2: iPhone manager | SwiftUI vault/list/search, scan/photo/manual add, group editor, Keychain and lock lifecycle | iOS 27 type checking and simulator tests; import preview and locked-vault behavior |
| M3: Offline band viewer | Native group tabs, lists, period-boundary updates, persisted vault lifecycle | Public fixtures match the phone while disconnected; wake/restart and rounded-screen checks |
| M4: Protected synchronization | Authenticated enrollment, bounded snapshot transaction, revision reconciliation, pending deletion and erase | Protection prerequisite resolved; tamper/replay/retry/interruption tests; physical sync with synthetic accounts |
| M5: Installable pair and acceptance | Versioned unsigned IPA and RPK, hashes, installation guide and device report | macOS/Xcode 27 build, archive checks, real-device acceptance; explicit remaining limitations |

M1/M2 can progress while physical M0 results are pending. M4 must not enable real-secret provisioning until the protection prerequisite passes. Product code should follow a written implementation plan with concrete files and verification commands.

## 11. Acceptance criteria

- Public RFC 6238 vectors agree on both platforms for all supported algorithms; include timestamps beyond 2038, boundary seconds, leading zeroes, and both digit lengths.
- Import ordinary QR codes, selected QR images, manual secrets, and a multi-part Google export. Reject malformed/oversized input and incomplete/conflicting batches with an actionable local error.
- Group rename/reorder/account movement on iPhone appear in the next confirmed band snapshot.
- Offline band codes remain correct across several periods, screen sleep, app reopen, and device restart when time remains trusted.
- Removing or renaming an account while the band is offline leaves a visible pending state on iPhone until committed.
- Interrupted synchronization, duplicate messages, lost completion replies, stale callbacks, and storage failure never publish a partial vault.
- No secret, current code, QR payload, AuthKey, or application key is recorded in diagnostics or test artifacts. Fixtures use publicly documented or synthetic data only.
- Every band label and digit lies inside the accepted display mask at native size; 8-digit codes and long labels never overlap adjacent content.
- Initial performance targets: first useful offline code within 1 second of app activation; tab response within 150 ms; next-period visible update within 250 ms of the boundary while foreground. These require hardware measurements and are not promises from a simulator.
- Report cold/warm start separately, test the maximum supported account set, and record p50/p95/max plus device/firmware/build versions. Compare battery behavior with timers stopped when hidden.
- Build and test with Xcode 27/iOS 27. Node checks or Swift parsing on Windows cannot substitute for Apple compilation.

## 12. Delivery and review

Deliver source, reproducible build configuration, an unsigned iOS IPA when a macOS build environment is available, a signed/installable RPK using the user's appropriate signing workflow, artifact hashes, and a hardware checklist. Signing secrets remain outside the repository.

Current external dependencies are a macOS/Xcode 27 build route, the user's existing RPK installation route and AuthKey, and physical Band 10 checks. No remote repository has been created, no Apple credentials have been requested, and no real OTP material is needed for development.

The user has approved the written design. Next, review the detailed implementation plan and select inline or delegated execution. The two confirmed answers in section 1 remain valid and should not be asked again.

See [baseline findings](../../research/2026-10-10-baseline-findings.md) for local evidence and official references.
