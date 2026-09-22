# Production operations

The repository enforces what can be enforced in source. Account-level controls remain release gates.

## Mandatory external gates

- Protect `main` with pull requests, required `verify`, CODEOWNERS review, and at least one reviewer other than the author.
- Add a second production maintainer/team as CODEOWNER before declaring independent approval available. The checked-in CODEOWNERS intentionally names only the current owner until another maintainer is actually assigned; this prevents a fictional reviewer from being represented as real.
- Use separate staging and production Netlify/Cloudflare projects and credentials.
- Enable GitHub secret scanning and push protection.
- Configure MongoDB backups/PITR and perform quarterly restore drills; record RPO/RTO.
- Rotate certificate signing keys with overlapping verification keys and test recovery quarterly. Use `REVOKED_CERTIFICATE_IDS` for emergency revocation until a durable revocation store is introduced.
- Perform an independent security assessment before enabling any claim of hostile-code sandboxing.
- Record successful dependency-outage, database-restore, signing-key, and rollback drills.

## Security boundary

The browser VM is not a host-kernel isolation boundary. Guest networking remains disabled for the real guest profile. This project must not be marketed or operated as a general-purpose hostile-code execution service.
