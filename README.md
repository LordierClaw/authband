# AuthBand

Authenticator manager for iOS 27 and an offline Xiaomi Smart Band 10 companion.

## Status

The iPhone manager and offline band viewer are implemented, but the user's Mi Band testing rejected band build 4. Build 5 repairs input locking and list reconstruction, adds explicit navigation, and is checked in the native Vela emulator before handoff. See the build-5 record and its native screenshots; host logic tests alone are not UI acceptance. Do not treat this as a production security release.

**Real-secret transfer to the band is disabled in both profiles pending physical acceptance and explicit release approval.** The capability profile accepts only the public RFC test secret. The release profile contains no sample accounts. Neither build is a substitute for a backup of your existing authenticator.

Implemented surfaces:

- Offline TOTP: SHA-1/256/512, 6/8 digits, periods 15-120 seconds.
- Groups on one band page: horizontal tabs, static account lists, remembered row position and a selected-account code view.
- iPhone account/group editing, camera and photo QR, manual setup, multipart Google Authenticator import with duplicate/error preview.
- Face ID/passcode vault unlock, encrypted local files, inactive privacy cover, local expiring clipboard.
- Explicit BLE connection using the BlueBand transport, separately authenticated enrollment/sync and durable commit receipts.
- Limits: 100 phone accounts, 50 selected for band, 8 groups, 20 selected accounts per group. Imported accounts are phone-only by default.

No cloud, telemetry, location access or background Bluetooth service is included. Xiaomi AuthKey acquisition and RPK installation are outside this app.

## Build And Test

Install Node 20.19.5 and dependencies with `npm ci` and `npm ci --prefix apps/band`.

```powershell
npm test
node --test tests/release.test.mjs
npm run build:band -- --profile capability
node --test tests/rpk-page.test.mjs tests/rpk-archive.test.mjs
node scripts/setup-band-signing.mjs
npm run build:band -- --profile release
```

On a Mac with Xcode 27, an iOS 27 simulator and XcodeGen 2.46.0:

```sh
npm run test:swift
npm run test:transport
node scripts/check.mjs native
npm run test:ios
npm run build:ios
npm run build:ios -- --profile capability
```

Windows cannot build iOS. CI is split by changed paths: band changes run the small band suite and packaging; iOS changes run Swift tests and one simulator size on `xcode-27`. The iOS workflow's manual `full` option adds the second size and IPA exports. Outputs are under `artifacts/`; IPA files are unsigned and need your Apple signing workflow before device installation. Signing private keys are never committed or uploaded.

## Design records

- [Approved requirements and architecture](docs/superpowers/specs/2026-10-10-authband-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-10-authband.md)
- [Baseline findings and technical constraints](docs/research/2026-10-10-baseline-findings.md)
- [Security boundaries](docs/security/security-model.md)
- [Installation and recovery](docs/release/install.md)
- [Physical test checklist](docs/testing/band-capabilities.md)
- [Band build 3 list-first performance revision](docs/testing/band-list-first.md)
- [Band build 4 detail layout and native gesture revision](docs/testing/band-ui-gestures-build4.md)
- [Band build 5 native UI verification and repair](docs/testing/band-native-build5.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Firmware **3.2.8** was reported by the user; prior versions work on their band. Current AuthBand hardware acceptance and latency targets are **not yet measured**.
