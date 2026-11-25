# Developer Alpine integrity-manifest recovery

## Symptoms

Developer Alpine can stop before VM creation with an integrity-manifest error. This is expected fail-closed behavior: the Worker must not serve streamed image chunks until it can validate a complete manifest for the pinned ISO. Quick Linux at \`/real-linux/\` uses a different, fully downloaded and verified image path and is the temporary alternative.

## Root cause and safety boundary

\`artifacts/developer-alpine-chunks.json\` in a source checkout may contain placeholder empty hashes. The 691,011,584-byte ISO is not stored in the source archive, so real per-chunk SHA-256 values cannot be derived from that archive. Never fill these fields with guessed hashes, derive them from a different image, or weaken browser/Worker integrity checks.

## Recovery procedure

1. Confirm \`artifacts/manifest.json\` pins the intended Developer Alpine release URL, byte length, and full-image SHA-256.
2. Use a CI checkout with Node 22 and network access to the pinned release asset. Run \`node scripts/generate-iso-chunk-manifest.mjs\`. The generator verifies the entire downloaded stream against both the pinned size and full-image SHA-256 before writing chunk hashes.
3. Run \`npm run test:iso-worker\` and inspect the generated manifest: schema version, artifact digest and size must match the pinned artifact; chunk boundaries must be contiguous; each chunk must have a 64-character lowercase SHA-256.
4. Run the full CI checks on the same commit. The \`.github/workflows/deploy-cloudflare.yml\` workflow regenerates and validates the manifest from the pinned artifact and is gated behind an explicit production confirmation.
5. Only after CI passes, manually dispatch the Cloudflare deploy workflow with \`confirm_production_deploy=true\` and configured Cloudflare secrets. Do not bypass the workflow gate.
6. Verify the deployed Worker returns the Developer manifest with \`X-LinuxLab-Chunk-Manifest: sha256\` and a complete list of valid chunk hashes for the pinned digest. Then hard-refresh \`/developer-alpine/\` and verify the VM boots.

## If generation fails

Check release availability, network access, the pinned size/digest, and CI logs. A size or digest mismatch means the source artifact is not the pinned release; stop and investigate rather than updating the pin without provenance. Until a valid Worker manifest is deployed, use \`/real-linux/\`.
