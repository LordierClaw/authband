# AuthBand

Authenticator manager for iOS 27 and an offline Xiaomi Smart Band 10 companion.

## Current stage

Requirements and architecture approved on 2026-10-10. The implementation plan is ready for review; product implementation has not started.

Confirmed requirements:

- The band generates OTP codes offline and stores the required secrets.
- Each band tab contains a group of accounts. Swipe horizontally between groups and scroll vertically through accounts.
- The iPhone app manages accounts, group names and order, Google Authenticator imports, and ordinary QR/manual setup.
- Both apps prioritize fast access, a minimal dark interface, and readable codes. Band content respects its rounded display.

## Design records

- [Approved requirements and architecture](docs/superpowers/specs/2026-10-10-authband-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-10-authband.md)
- [Baseline findings and technical constraints](docs/research/2026-10-10-baseline-findings.md)

No IPA, RPK, hardware acceptance, or performance result is claimed yet.
