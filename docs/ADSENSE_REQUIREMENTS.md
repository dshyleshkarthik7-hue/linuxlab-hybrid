# AdSense readiness checklist

Advertising is **disabled until every gate below is verified**. The repository cannot infer or invent a publisher ID. \`public/ads.txt\` is a reminder placeholder, not a valid publisher authorization record; do not apply for production ads with it in place.

## Required before enabling ads

- [ ] Verify ownership of \`linuxterminal.me\` in the intended Google AdSense account.
- [ ] Replace \`public/ads.txt\` with the exact \`google.com, pub-…\` seller line and relationship supplied by that account. Verify \`https://linuxterminal.me/ads.txt\` returns HTTP 200 and \`text/plain\`.
- [ ] Publish a privacy policy that explains Google advertising, cookies, identifiers, personalization and consent choices.
- [ ] Publish accurate terms and a working contact route.
- [ ] For EEA/UK/Swiss traffic where required, configure a Google-certified consent management platform before loading non-essential advertising.
- [ ] Update the Content Security Policy only for the domains required by the approved ad implementation; keep CSP tests passing.
- [ ] Add an explicit kill switch that defaults off. Test that turning it off prevents ad scripts and slots from loading.
- [ ] Keep advertising out of VM canvases/terminals, quizzes and exam screens, certificate verification, authentication, and error states.
- [ ] Confirm meaningful original learning content and editorial review before applying. A command catalogue entry or generated draft is not a completed lesson.
- [ ] Run the full build, SEO/sitemap checks, CSP/security tests, accessibility checks, and a production smoke test.

## Operational policy

Never commit a fake publisher ID, load AdSense by default, or claim approval before Google has approved the site. Keep the feature flag off until the production ads.txt response, consent handling, privacy disclosure, CSP, placement policy, and content quality have all been reviewed.
