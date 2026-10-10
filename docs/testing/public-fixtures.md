# Public Test Accounts

These credentials are public test data, not personal OTP secrets. Never use this
key to protect a real service account.

- ASCII key: `12345678901234567890` (20 bytes).
- Base32 key: `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`.
- Period: 30 seconds; standard Unix time, no custom epoch.
- The band capability fixture has 50 accounts / eight groups, covering SHA1,
  SHA256 and SHA512, each with six and eight digits. The issuer starts with the
  algorithm name. Odd-numbered accounts use six digits; even use eight digits.
- Use the issuer and digits to select matching advanced settings in an
  independent reference authenticator, or in a phone-only AuthBand test account.
  The SHA256/SHA512 keys deliberately remain 20 bytes here; their values are NOT
  the RFC6238 appendix values that use longer keys. Automated core tests cover
  the original RFC6238 appendix vectors separately.

Run layout/algorithm checks before RFC sync. The iPhone capability action replaces
the 50-account preview with a deterministic `RFC TEST` group containing two SHA1
accounts (six and eight digits, same key/period). Verify the confirmed pair after
disconnect, rollover and reboot; the previous 50 preview accounts must not return.
Repeated sync sends the same public snapshot and must remain idempotent.

This action never sends personal accounts, names or groups from the iPhone vault.
Phone group edits therefore do not appear on the band while the real-secret gate
is closed. Personal-account selection/sync is unavailable pending physical
acceptance. Do not mistake a public test receipt for a personal-vault receipt.

Full interrupted-write/deletion fault injection is automated in the receiver/store
tests. Power-cut timing at native file-operation boundaries cannot be forced from
the normal UI; that portion of hardware acceptance requires an instrumented device
test procedure and remains NOT RUN. Do not mark it passed by merely rebooting once.
