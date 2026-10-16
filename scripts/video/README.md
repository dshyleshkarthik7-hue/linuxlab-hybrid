# Curriculum video generation

This tool turns the shared `learn/curriculum.json` into text-and-code walkthrough videos. It uses the existing FFmpeg renderer and does **not** execute commands from lesson text or fabricate terminal output.

## Requirements

- Node.js version supported by this project
- `ffmpeg` with the `drawtext` and H.264 encoders enabled
- `ffprobe`
- A usable font. If FFmpeg cannot locate a default font, set `LINUXTERMINAL_VIDEO_FONT` to an installed font file path.

Verify tools before rendering:

```sh
node --version
ffmpeg -version
ffprobe -version
```

## Render a small sample first

```sh
npm run video:curriculum -- --limit 5
```

Choose one track:

```sh
npm run video:curriculum -- --track Networking --limit 10
```

Render the complete curriculum only when there is enough build time and disk space:

```sh
npm run video:curriculum -- --all
```

Output files and a manifest are written to `public/tutorial-videos/`. Vite copies public assets into the next production build. The lesson library reads the manifest optionally and embeds a player when a rendered video exists. If the manifest is absent, the lesson text still loads normally.

The batch command exits non-zero if any selected video fails and records failures in `manifest.json`. Review the manifest before deploying. Rendering hundreds of videos can take substantial time and storage; test a small batch first. Videos contain text slides, not captured live terminal output or generated narration.
