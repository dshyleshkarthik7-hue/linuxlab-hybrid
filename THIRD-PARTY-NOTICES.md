# Third-party notices

LinuxTerminal bundles or depends on software distributed under the licenses below. Package versions and source locations are recorded in `package-lock.json`.

## MIT

The MIT-licensed dependencies include xterm, xterm-addon-fit, Monaco Editor, Vite, esbuild, and their MIT-licensed transitive dependencies where identified by npm package metadata.

Copyright notice and license text for each package remain the responsibility of the corresponding upstream package. Source packages are fetched from the npm registry URLs recorded in `package-lock.json`.

## Apache License 2.0

TypeScript is distributed under the Apache License 2.0. Upstream project: https://github.com/microsoft/TypeScript

## Mozilla Public License 2.0

Lightning CSS is distributed under the Mozilla Public License 2.0. Upstream project: https://github.com/parcel-bundler/lightningcss

## v86

The browser x86 emulator is vendored as `public/libv86.js`. Its upstream provenance and license must remain documented alongside the exact vendored artifact; do not replace or modify the artifact without updating that provenance.

## Firmware

SeaBIOS/VGA BIOS assets are served only through the verified firmware path. The build must fail if required firmware is represented by an unresolved Git LFS pointer rather than actual binary content.
