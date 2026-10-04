# Live Vote

Thai voting workspace with a participant page at / and organizer controls at /manage.

Features: customizable integer score range from 1 to the configured maximum, custom duration, automatic closing, shared average and participant count, manual close, and reset. The database holds one current round with aggregate total and count only. No names, individual scores or historical rounds are stored. A signed browser receipt prevents ordinary repeated voting in the same browser; without identities the count represents browser submissions rather than verified unique people.

Organizer access uses a secret capability link: /manage#key=<ADMIN_KEY>. The browser sends the key in an authorization header; the fragment is removed from the address bar and kept only for the current tab session. Send participants the root URL without the organizer key.

Runtime secrets: ADMIN_KEY and VOTE_SECRET. Logical D1 binding: DB. The registered Sites project is preserved in .openai/hosting.json. Do not register a second project when continuing.

Preparation after network access is available:
1. Install the preserved package-lock.json dependencies with the Sites dependency helper.
2. Generate and inspect the Drizzle migration: npm run db:generate.
3. Typecheck: node node_modules/typescript/bin/tsc --noEmit.
4. Run the integration checks: node scripts/verify-voting.mjs.
5. Build and publish through the Sites workflow, reusing this project's identity.

Current delivery status: source prepared; service integration tests pass. Dependency installation, framework build, source push and online publication remain blocked by outbound networking restrictions in the creation environment. No online deployment has been completed.

The separate live-vote-local.html artifact is a complete, self-contained single-device alternative. Its results stay only in memory and disappear on refresh or close. It does not combine votes from different devices.
