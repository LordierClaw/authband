# Device Acceptance

Date: 2026-10-10. User-reported Mi Band 10 firmware: **3.2.8**. User reports previous app versions can be tested normally. This does not establish results for the current AuthBand build.

Use only the capability profile's public RFC data. Record the artifact SHA-256 from its `.rpk.json` and the matching iPhone `.ipa.json`; include device model/region/firmware, iPhone model/iOS, app build and signing identity. Never include personal OTP keys, Xiaomi AuthKey or enrollment key in reports.

See [public test accounts](public-fixtures.md) for the exact key, algorithm/digit matrix and the two-account replacement after RFC sync. Test the initial 50-account layout before syncing. The public sync does not send personal group edits. Native power-cut boundary tests need device instrumentation; normal UI checks alone do not establish those results.

| Check | Current physical result |
| --- | --- |
| Install and open current AuthBand RPK | NOT RUN |
| Nonblank first code offline, phone disconnected | NOT RUN |
| SHA-1/256/512, 6/8 digits match reference | NOT RUN |
| No clipped digits at 212x520 rounded edges | NOT RUN |
| Long Vietnamese issuer/label remains distinguishable | NOT RUN |
| 8 groups / 50 accounts, horizontal/vertical/diagonal swipes | NOT RUN |
| Return from details/settings; sleep/wake restores position | NOT RUN |
| No expired value at rollover/wake; wall-clock changes | NOT RUN |
| Enter/cancel/retry 32-hex protected enrollment key | NOT RUN |
| Connect/proof/package trust and RFC-only sync | NOT RUN |
| Disconnect per chunk; retry lost commit response | NOT RUN |
| Restart/power interruption at storage boundaries | NOT RUN |
| Confirmed deletion cannot reappear after reboot | NOT RUN |
| Local erase, interrupted erase and re-enrollment | NOT RUN |
| iPhone Face ID cancellation/passcode/lock during QR and sync | NOT RUN |
| Locked physical iPhone cannot access protected vault | NOT RUN |

Capture 20 cold and 50 warm samples for first useful offline code; record p50/p95/max. Targets are under 1 second for first code, 150 ms for group response and 250 ms for foreground rollover. Desktop Node timings do not count as physical performance evidence.

Automated coverage runs the actual packaged native page script in a VM with only native API substitutes, plus bounded-storage fault injection and crypto vectors. This catches module imports, state transitions and timer leaks, but does not render Vela pixels or prove firmware gesture behavior.

For clock changes during sleep, record forward and backward adjustments separately. Without a native monotonic clock, a forward wall jump may remain indistinguishable from elapsed time. Do not mark this row passed without stating the tested firmware behavior and residual limitation.
