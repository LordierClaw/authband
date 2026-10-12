# Security Boundaries

## Release Gate

Real-secret provisioning is deliberately disabled until independent review and the device acceptance checklist pass. This is a development gate, not a claim of certification. The iPhone can manage real accounts locally; do not replace your existing authenticator or recovery codes during testing.

## iPhone

The vault and device enrollment state use AES-256-GCM. A random encryption key is held in Keychain with `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` and user presence. Authentication is Face ID or device passcode. Files are atomically written with complete protection and excluded from backup. A missing key or corrupt ciphertext never silently creates an empty vault over existing files.

Export shows Google Authenticator `otpauth-migration` QR codes only after a fresh device-owner authentication; anyone who sees or photographs them gets every exported secret. Accounts with a period other than 30 seconds are listed as not exported because that format has no period field. If the Keychain key is gone (for example after the passcode is removed), the user can erase the undecryptable vault files and start a new empty vault; the app checks that the key is really missing first.

The active interface is covered before inactivity, including presented sheets. Backgrounding locks the repository, invalidates authentication/callback generations and disconnects Bluetooth. Clipboard items are local-only and expire at the earlier of 30 seconds or the OTP boundary. These are platform controls, not protection against a compromised OS, a camera photographing the screen, or a previously copied value held by another app.

Swift and JavaScript may copy immutable data. References and mutable buffers are cleared where practical; guaranteed memory erasure is not claimed. Simulator checks cannot establish physical data-protection or Keychain passcode behavior.

## Band

The user chose offline codes and accepted storing OTP keys on the band. There is no secure enclave, verified OS keystore, encrypted-at-rest guarantee, or recurring PIN gate in this version. Someone who can read app storage may recover the OTP keys. Physical possession also allows reading current codes.

Two snapshot slots and a verified publication head avoid acknowledging incomplete storage. Deletion is not confirmed until the obsolete slot is removed and checked. Ambiguous recovery fails closed. The device firmware's actual write/durability semantics still need power-loss testing.

Enrollment uses a 128-bit random key generated on the iPhone. In the capability profile it is sent once (`auth.enroll`) after Xiaomi AuthKey authentication and RPK fingerprint trust, so it is protected only by the Xiaomi transport encryption; the band refuses to replace an existing key or adopt leftover vault slots. Xiaomi transport compatibility is retained, but transport encryption is not treated as application integrity. The protected channel derives direction-specific keys with HKDF-SHA256 and uses AES-256-GCM. Epoch high-water marks are persisted before session readiness; sequence numbers and exact-retry caching prevent reapplication. See [the wire contract](../protocol/protected-channel-v1.md).

An acknowledged transport packet is not a saved vault. The iPhone reports confirmation only after a matching authenticated vault ID, revision and digest, followed by an accepted clock sample. Incomplete or timed-out transfers remain unconfirmed.

## Time

Offsets use UTC Unix time, not local timezone. Round-trip samples above one second are rejected. Missing/corrupt clock state, backward jumps and observed wall/monotonic discrepancies mask codes until resync.

The current native Vela adapter has only wall-clock input. A forward clock change while the app is suspended or the band is powered off cannot be distinguished from legitimate elapsed time without a reliable monotonic/RTC source. Physical testing must establish the firmware behavior; this limitation is part of the real-secret gate, not silently considered solved.

## Dependencies And Scope

Runtime crypto uses Stablelib 2.x and jsSHA 3.3.1 on Vela; Apple's CryptoKit-compatible Swift Crypto facade on Apple. Tests include published vectors and an independently constructed channel vector. Tests are not a cryptographic audit.

The root npm runtime dependency audit was clean on 2026-10-10. After updating the build-only `tmp` override to the patched 0.2.7, a fresh install reports 11 inherited high-severity advisory entries rooted in `braces@3.0.3`, with no patched upstream version available at inspection. Overrides remove the previously reported critical toolchain issues. The remaining package is build-only, not bundled into the RPK; build trusted checked-in paths and patterns only. Recheck `npm audit` and `npm audit --prefix apps/band` before release, and replace the toolchain dependency when a compatible patch is available.

No analytics, network account storage, raw capture logging, QR logging or secret diagnostics are included. GitHub stores source and synthetic CI artifacts only. Local RPK signing keys stay in ignored `apps/band/sign/`; back them up securely outside Git.
