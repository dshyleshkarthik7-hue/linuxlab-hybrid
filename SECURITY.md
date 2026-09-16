# Security Policy

## Reporting a vulnerability

Please do not disclose security vulnerabilities in public issues. Report them privately through the repository's GitHub security reporting mechanism when available.

Include the affected URL or file, a concise reproduction, expected versus observed behavior, and any relevant logs. Do not include passwords, API keys, private certificates, or other secrets in a report.

## Scope

Security-sensitive areas include browser VM isolation, CSP, firmware and ISO integrity, edge functions, certificate issuance, authentication, and persistence.

## Security principles

- Browser VM execution must remain isolated from the host environment.
- Firmware and ISO artifacts must be verified before use.
- CSP must not be weakened merely to make a page load.
- Secrets must remain server-side and must never be committed to the repository.
