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


## Browser VM boundary

The browser VM is an educational execution environment, not a host-kernel security boundary and not a general-purpose hostile-code execution sandbox. The real guest profile keeps guest networking disabled. Do not enable arbitrary guest networking without an independently reviewed isolation design.

## Data handling

Tutor requests are authenticated and rate-limited. Learner context is treated as untrusted prompt data. Production failures are returned as explicit 5xx responses rather than silently converted into successful fallback responses. Do not log learner prompts or authentication material.


## Credential and client trust
Certificate verification establishes that a server-signed educational record exists; it does not establish identity, unique authorship, invigilation, absence of collaboration, institutional recognition, or professional accreditation.

Browser ISO verification is an artifact-integrity control, not trusted-client verification. VM resource controls are stability/abuse controls, not host-kernel isolation. External Identity, Redis, MongoDB, and Tutor-provider services are production trust boundaries and must fail closed where they affect authentication or credential issuance.