# AdSense readiness checklist

Publisher ID supplied by the site owner: \`pub-3209988960226055\`. The \`public/ads.txt\` file now publishes the corresponding Google seller record. This does **not** prove Google has crawled or accepted the file, approved the site, or authorize loading ads before consent/privacy and placement checks are complete.

## Required before enabling ads

- [ ] Verify ownership of \`linuxterminal.me\` in the intended Google AdSense account.
- [ ] Verify \`https://linuxterminal.me/ads.txt\` returns HTTP 200 and \`text/plain\`, and that the published seller record matches the AdSense account.
- [ ] Publish a privacy policy that explains Google advertising, cookies, identifiers, personalization and consent choices.
- [ ] Publish accurate terms and a working contact route.
- [ ] For EEA/UK/Swiss traffic where required, configure a Google-certified consent management platform before loading non-essential advertising.
- [ ] Update the Content Security Policy only for the domains required by the approved ad implementation; keep CSP tests passing.
- [ ] Add an explicit kill switch that defaults off. Test that turning it off prevents ad scripts and slots from loading.
- [ ] Keep advertising out of VM canvases/terminals, quizzes and exam screens, certificate verification, authentication, and error states.
- [ ] Confirm meaningful original learning content and editorial review before applying. A command catalogue entry or generated draft is not a completed lesson.
- [ ] Run the full build, SEO/sitemap checks, CSP/security tests, accessibility checks, and a production smoke test.

## Operational policy

Never load AdSense by default or claim approval before Google has approved the site. Keep the feature flag off until the production ads.txt response, consent handling, privacy disclosure, CSP, placement policy, and content quality have all been reviewed.
