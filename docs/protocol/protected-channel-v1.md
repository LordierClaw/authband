# Protected Channel v1

Status: implementation and independent security review in progress. Not approved for real OTP secrets until hardware acceptance.

Enrollment: iPhone generates 16 cryptographically random bytes and a UUID pair ID. The user types the 32 hexadecimal key digits on the band. The band receives the public pair ID with the first authenticated hello; the key is never sent over BLE. Enrollment is permitted only with no existing vault or after an explicit local erase.

All strings below are UTF-8. UUIDs use uppercase canonical form. Integers are canonical unsigned decimal strings, maximum 2^53-1. Base64 uses RFC4648 with padding, without whitespace. An epoch is increased and saved by the phone before sending; the band persists an authenticated increasing high-water mark before replying. An interrupted or corrupt epoch store requires re-enrollment; never reset it silently.

Hello has `{v:1,p:pairID,e:epoch,n:salt,m:mac}`. Salt is 32 fresh random bytes from iPhone. The MAC is HMAC-SHA256 with the pairing key over `AuthBand/hello/1\npairID\nepoch\nsalt`. The band authenticates before persisting the epoch. An exact same hello in the current live session resends the original ready frame. After restart an old epoch is rejected.

HKDF-SHA256 uses the pairing key as input, the 32 salt bytes, and info `AuthBand/key/1\npairID\nepoch\nphone` or the same suffix `band`, output 32 bytes each. Each direction has separate AES-256-GCM key, 12-byte nonce and 16-byte tag. Nonce is big endian uint32 direction (phone=1, band=2) followed by big endian uint64 sequence (1..2^32-1). Sequences reset only for a freshly persisted epoch with new salt.

Frame has `{v:1,e:epoch,s:sequence,t:topic,c:ciphertextWithTagBase64}`. AAD is `AuthBand/frame/1\npairID\nepoch\nsalt\ndirection\nsequence\ntopic`. Topic is ASCII `[a-z][a-z0-9.]{0,31}`. Authenticated plaintext is a bounded UTF-8 JSON payload. Only the next sequence is accepted. An exact duplicate of the last frame yields a duplicate flag and reuses the cached response; changed bytes at the same sequence fail. Neither failure advances the accepted counter. No counter/key resumption after process death.

The outer Xiaomi envelope uses topic `auth.hello` or `auth.frame`, maximum 512 UTF-8 bytes including its ID/source/type. Outer delivery ACK only confirms delivery. Authenticated requests have a `request` identifier echoed in responses; the phone accepts only the expected request and topic. One request is outstanding, exact-ciphertext retries, bounded deadlines. No secrets in logs or diagnostics.

Requests: `vault.status`, `vault.begin` (vaultID, revision, digest, byteCount), `vault.chunk` (offset, base64 bytes), `vault.commit`, `vault.abort`, `time.sample`. Begin limits to 64 KiB; chunks at most 96 bytes; offset must equal received byte count (duplicate transport retries are handled by the channel). A commit requires the declared SHA256 of the complete original snapshot bytes, valid model and durable journal/readback/obsolete-slot cleanup. The reply `vault.committed` contains only vaultID/revision/digest. Lost commit replies reconcile using status on a new protected session.

Snapshot JSON is encoded with sorted object keys, no slash escaping, UTF-8, no insignificant whitespace. Arrays preserve order. Revision uses a decimal string. The same canonical bytes are persisted and hashed on both platforms.

Threat limits: no band hardware keystore or at-rest secrecy claim. Physical band access can expose secrets and enrollment material. JS implementations do not guarantee constant-time execution or erasure of immutable strings. Factory reset/uninstall can remove the local vault. Do not delete the phone copy or another recovery method after provisioning.
