# Third-Party Notices

## Imported Project Code

`packages/BlueBandKit` and the CoreBluetooth/Keychain adapters derive from the user's local BlueBand repositories. Module names and compatibility tests were preserved; app-specific namespacing/composition is documented in Git history. Provenance and baseline hashes are in `docs/research/2026-10-10-baseline-findings.md`. The current `blueband-map/LICENSE` identifies Apache-2.0, Copyright 2026 LordierClaw; its full text is retained in `apps/ios/Resources/BlueBand-LICENSE.txt`. The `blueband-ios` directory was a read-only behavioral reference, not a separately licensed dependency copied wholesale.

## Runtime Dependencies

- Stablelib 2.x: MIT, Dmitry Chestnykh and contributors. The AES module includes its upstream Go/AES notices.
- jsSHA 3.3.1: BSD-3-Clause, Brian Turek, Paul Johnston and contributors.
- Swift Crypto 4.5.1: Apache-2.0 with Swift Runtime Library Exception, Apple and contributors. Apple builds use the CryptoKit facade. Its source repository also contains third-party cryptography notices for non-Apple implementations.
- Apple system frameworks: supplied by the OS, not vendored into this repository.
- Lucide 1.8.0: ISC, Lucide Icons and Contributors (including upstream Feather notices). `Settings2`, `LogOut` and `ChevronLeft` were rasterized to 44px transparent PNG hit areas with 24px glyphs. Full upstream license: `apps/band/src/common/icons.LICENSE.txt`. No Lucide JavaScript runs on the band.

The build mechanically collects the installed Stablelib/jsSHA license files, without rewriting their text, into the band artifact. iPhone resources include the pinned Swift Crypto license and notices. Dependency lockfiles retain exact npm tarball integrity and Swift package versions are pinned.

## Test And Build Dependencies

CryptoSwift 1.10.0 is used by imported transport tests only. esbuild, fflate, pngjs, XcodeGen and aiot-toolkit are development/build dependencies. Their license files remain in their installed distributions; they are not application runtime imports.

The Vela toolkit's public development signing identity is not a production identity. Local release keys are generated separately and excluded from source control. Remaining build-tool advisory risk is documented in `docs/security/security-model.md`.
