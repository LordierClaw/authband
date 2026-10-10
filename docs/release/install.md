# Install And Recover

## Profiles

`AuthBand-capability.rpk` includes 50 public sample accounts in eight groups. `AuthBand-release.rpk` starts empty. Both reject non-public OTP secrets until the release gate is explicitly completed. The capability iPhone IPA exposes RFC test sync; the release IPA does not. Neither is an App Store/TestFlight release.

Every artifact has adjacent JSON with size, profile and SHA-256. Match the profile and commit between phone and band. A successful build alone does not establish physical acceptance.

## iPhone

Download the unsigned IPA from the private Actions run or use a local Xcode 27 build. Sign with your own Apple development/distribution identity and provisioning appropriate for `dev.lordierclaw.authband`. No Apple credentials have been configured in CI. The unsigned IPA cannot be installed directly as a normal App Store app.

The first real unlock requires an iPhone passcode. AuthBand creates a device-only vault key after user presence. Camera and Bluetooth permissions are requested only when those features are used. QR images are decoded locally; importing from Google uses its exported migration QR codes, not access to your Google account.

## Band

Install the RPK using the same trusted sideload path already used for the BlueBand baseline. AuthBand intentionally does not install RPKs or extract Xiaomi AuthKey. Keep your existing authenticator and recovery codes throughout this test.

1. Open AuthBand on both devices. On iPhone, choose Band, find the band and enter its Xiaomi transport AuthKey.
2. Reveal the separate AuthBand pairing key on iPhone. Tap the band title, choose pairing, and enter all 32 hexadecimal characters locally on the band.
3. Connect from iPhone while the band app is open. The capability iPhone build can sync public RFC accounts only.
4. Wait for the authenticated confirmation. Disconnect the phone and verify the same codes on the band through a time boundary and sleep/wake.

## Signing Identity

`node scripts/setup-band-signing.mjs` creates a local RSA signing key/certificate only when absent. Release builds require them. Never commit the private key or upload it as an artifact. Keep the identity stable for updates.

Capability builds without local signing files use the toolkit's public development identity. With local files, they use that local identity. Therefore CI capability builds and locally signed RPKs can have different fingerprints. The iPhone pins the first accepted RPK identity and rejects an unexpected replacement. Do not disable this check to make a replacement connect.

## Recovery

Replacing the band app's signing identity, reinstalling the phone app, losing the pairing key or resetting the band requires explicit re-enrollment. Remove the old pairing on iPhone and erase AuthBand data locally on the band, then pair again. A local band erase requires two confirmations and removes its stored vault and enrollment data. It does not delete iPhone accounts.

A corrupt iPhone vault is not automatically reset; preserve the files for diagnosis and use the original authenticator/recovery codes. No cloud or export backup is provided in v1. Losing the phone-only vault key makes its encrypted files unrecoverable.

Deleting a phone account marks a newer vault revision, but does not remotely erase an offline band. The band copy is removed only after a confirmed sync or an explicit local band erase. Lost bands cannot be remotely wiped; rotate affected service authenticator secrets through the service's own recovery settings.
