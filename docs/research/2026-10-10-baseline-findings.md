# AuthBand baseline findings

Date: 2026-10-10. Read-only inspection; no baseline files changed.

## Local source availability

`E:/code/authband` started as an empty Git repository, on `master`, with no commits and no remote.

The first inspection of `E:/code/blueband-ios` found only `.git`. After the user requested another read, the source files were present. All conclusions below use that second inspection. Git still did not recognize that directory as a repository, so source provenance is recorded with file hashes instead of an invented commit.

`E:/code/blueband-map` is a Git checkout at `07cb579` (`docs: record verified performance measurement handoff`). Its existing modified README and untracked performance research document were read as local context and left untouched.

## What blueband-ios establishes

Sources read:

- `RUN.md`
- `REFERENCES.md`
- `docs/IOS_MI_BAND_10_CONNECTION_NOTES.md`
- `ios-band-poc/BlueBand/BLE/BandSession.swift`
- `ios-band-poc/BlueBand/Crypto/SessionCrypto.swift`
- `ios-band-poc/BlueBand/Chat/InterconnectSession.swift`
- `ios-band-poc/BlueBandTests/SessionCryptoTests.swift`
- `band-echo-rpk/src/pages/index/index.ux`
- `band-echo-rpk/src/manifest.json`
- `band-echo-rpk/package.json`
- `.github/workflows/build-ios.yml`

The connection notes record physical-device confirmation of scanning, Xiaomi authentication, proof reads, the ThirdPartyApp handshake, and bidirectional chat on Band 10 with RPK 0.3.4. They describe 0.3.5 as an ACK presentation change. This is recorded prior evidence, not a new hardware test.

The source uses CoreBluetooth, FE95, Xiaomi SPP v2, nonce/HMAC authentication, AES-CCM for the authentication descriptor, AES-CTR commands, and type-20 ThirdPartyApp routing. OTP features belong above these layers.

The working band baseline creates `interconnect.instance()` in `onReady`, reads `result.status`, uses one page, and unregisters callbacks on destruction. The notes identify router transitions and bundled helper modules as previous runtime trouble spots. A successful RPK build does not establish firmware compatibility.

The baseline is foreground-only and deliberately releases its Xiaomi session for Mi Fitness. It provides no RPK installer, AuthKey extraction, or continuous background service. Windows/npm is explicitly supported for protocol tests and RPK builds. The iOS workflow builds on macOS and emits an unsigned IPA.

### Source fingerprints

SHA-256, recorded after the second inspection:

| File relative to blueband-ios | SHA-256 |
| --- | --- |
| `docs/IOS_MI_BAND_10_CONNECTION_NOTES.md` | `010733a7f06ea1744c918df20714d294c972b5d236b3c76d0acf9c86da479d68` |
| `ios-band-poc/BlueBand/BLE/BandSession.swift` | `2351bf21be9c7fec39fecfc002b5ffa17231b9a856ef23c7ad7fde14f5aa60ad` |
| `ios-band-poc/BlueBand/Crypto/SessionCrypto.swift` | `a78693b5dac76bb5b3a4b0e7ac30b8d894e7dbf8783a0618a18fbbacbee183ae` |
| `band-echo-rpk/src/pages/index/index.ux` | `715d54ea5f4e053fbe9340637de54ecc0e32e2ef2e45cefeab9dde6fd96ebff4` |

## What blueband-map adds

- Reusable protocol, crypto, and session package boundaries in `packages/BlueBandKit`.
- Full RPK fingerprint continuity with TOFU. This establishes continuity after enrollment, not independent publisher identity.
- Versioned application envelopes, deduplication, bounded retry, and separation of transport receipt from feature completion.
- Native-send timeout lessons: callback 204 need not mean the peer lost accepted state. Avoid erasing valid offline data in response to a link error.
- Firmware bundle checks, including an entry without runtime custom-module loading.
- A screen mask in `BandDisplaySafeMask.swift`: 212 by 520, inset 12, cap centers y=106/413, cap radii 94, visual margin 6. The source labels it hardware accepted; AuthBand typography still needs its own device check.
- Explicit artifact versions, hashes, and separation of automated checks from hardware acceptance.

Do not copy the navigation renderer, map transfer pipeline, location permissions, or navigation background modes into AuthBand. Foreground provisioning is sufficient for offline OTP access.

Read current code when importing a contract: the map application-envelope document still says 512 bytes, while `ApplicationEnvelope.maximumEncodedSize` is 1,024. AuthBand can start with a conservative 512-byte application budget and define it once across sender, receiver, and tests.

## Security boundary discovered in source

Both baselines call the Xiaomi-specific `cryptCTR` transform separately for commands, defaulting `initialCounter` to the session key. The command path has no application authentication tag in that transform. Preserve these compatibility bytes, but do not treat this proprietary transport as a sufficient modern channel for provisioning OTP secrets or a new pairing key.

AuthBand needs an authenticated application protection and enrollment design above the existing transport before synchronizing real secrets. Its key must not be public in the RPK, derived from public device identifiers, or provisioned solely by relying on the inherited CTR path. This is a concrete prerequisite for secret provisioning, not a request to change Xiaomi framing.

## Official platform checks

Links were inspected on 2026-10-10:

- [Xiaomi Band 10 specifications](https://www.mi.com/global/product/xiaomi-smart-band-10/specs/): 212 by 520 display. Physical clipping must be handled in the layout.
- [Vela crypto](https://iot.mi.com/vela/quickapp/en/features/security/crypto.html): the support table explicitly marks Xiaomi Band 10 as **not supported**. Do not design against the presence of the documented HMAC, AES, or ECDH APIs on this device.
- [Vela storage](https://iot.mi.com/vela/quickapp/en/features/data/storage.html) and [file storage](https://iot.mi.com/vela/quickapp/en/features/data/file.html): documented persistence APIs; the pages do not establish a hardware-backed keystore, encrypted storage, or crash-atomic transactions for our target firmware.
- [Vela swiper](https://iot.mi.com/vela/quickapp/en/components/container/swiper.html) and [list](https://iot.mi.com/vela/quickapp/en/components/container/list.html): suitable candidate controls for horizontal groups and vertical accounts. Firmware gesture interaction remains a device test.
- [Apple Xcode requirements](https://developer.apple.com/xcode/system-requirements): the matrix lists Xcode 27 and the iOS 27 SDK. The old baseline workflow must not be assumed to select that SDK or an iOS 27 simulator.
- [Google Authenticator transfer help](https://support.google.com/accounts/answer/1066447): exported accounts can occupy multiple QR codes. Google-account cloud sign-in is not a third-party import API.
- [Google key URI format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format): `otpauth` provisioning format. Its historic app-specific comments are not evidence of current Google app behavior.
- [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238): independent TOTP vectors and algorithm reference.
- [noble-hashes](https://github.com/paulmillr/noble-hashes) and [noble-ciphers](https://github.com/paulmillr/noble-ciphers): candidates for established JavaScript primitives. No version or firmware compatibility was selected or verified in this inspection.

Google migration protobuf decoding needs additional implementation-source research and synthetic compatibility fixtures. The Google help page establishes the user transfer flow, not the binary schema.

## Current workstation

PowerShell and Node are available. `gh`, Docker, Make, Swift, and Xcode were not found on PATH. `wsl --list --quiet` reports WSL is not installed. This does not prove those tools are absent from every other directory or host.

Use the Windows-compatible build path from blueband-ios for band work. Apple compilation requires a configured macOS/Xcode 27 environment or CI. AuthBand has no remote yet; no repository was published and no remote build was started.

## Verification scope

This inspection read source, documentation, Git state, source hashes, tool availability, and official reference pages. It did not execute either baseline's test suite, build an RPK/IPA, measure runtime performance, connect a band, or use real OTP secrets.
