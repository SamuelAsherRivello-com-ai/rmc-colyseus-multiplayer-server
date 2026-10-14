# AI Repository Guidance

## Working directories

- Project name: **RMC Colyseus Multiplayer Server**.
- Run npm, Git, test, and release commands from the repository root.
- Keep implementation in `multiplayer-server/`: server source in `src/`, tests
  in `test/`, shared browser client in `packages/client/`, and documentation
  in `documentation/`.
- Root `server.ts` is the Vercel entry point. Keep it as a thin adapter.
- Root package/configuration files, `scripts/`, and `.github/workflows/`
  manage development, verification, and releases.

## Required hosting: Vercel free plan

- You MUST use Vercel's free (Hobby) plan for this project. This is a fixed
  requirement, not a preference.
- Keep implementation, configuration, and deployment proposals compatible
  with the free plan's features and limits. Do not enable paid features,
  purchase services, or upgrade the plan.
- Do not ask the user to choose a hosting provider or plan. Do not suggest
  alternative providers or paid plans as workarounds.
- When a requirement conflicts with the free plan, adapt the implementation
  to work within its limits. If that is impossible, explain the specific
  limitation without asking the user to switch providers or upgrade.
- This requirement does not authorize deployment; deploy only when requested.

## Shared multiplayer infrastructure and consumers

This permanent repository is the shared multiplayer infrastructure for its
existing and future consumer applications, including games. Work in this
repository; do not fork, copy, replace, or delete it for a consumer project.
The shared Vercel deployment remains the default backend. An approved server
release deploys over that existing deployment after compatibility and release
verification.

Before changing a consumer, use this checklist:

- Treat a consumer as client-only unless the request explicitly needs
  multiplayer. Do not call ordinary application work a game.
- If multiplayer is requested, inspect the registered rooms, documented
  protocol, and released shared client first. Reuse the shared endpoint and
  exact compatible client release when they meet the consumer's needs.
- Classify the result. Reusing an existing room, protocol, and shared-client
  capability requires no server change, release, or deployment. A new room,
  protocol, authoritative server behavior, or shared-client capability is an
  additive server change.
- Preserve every existing consumer's room keys, message contracts, imports,
  and deployment endpoint. Add a compatibility test when a change can affect
  an existing contract.
- For an additive server change, release server-first: run the server tests;
  build, test, and release the shared client when it changed; deploy the
  verified server to the existing Vercel deployment; then complete public
  two-client verification for the changed capability and affected existing
  contracts.

## Documentation and consumers

- Use **Live Demos** in READMEs and link to the GitHub Pages sites of consuming
  repositories. This server has no standalone playable demo.
- Keep the demo lists and `multiplayer-server/documentation/games.md` aligned
  with supported game consumers. Do not list unrelated games. Non-game
  applications can reuse documented rooms and the shared client without a game
  registry entry unless they introduce a new server capability.
- Whenever a new game updates this server, add or update its root README
  Live Demos bullet and supported game registry entry. Use one bullet per game
  in the format `[**Game Name**](GitHub Pages URL) — short description.` and
  keep the lists in alphabetical order by game name. Label demos still in development.
  Only when an in-development game has no public GitHub Pages URL, use an
  unlinked `**Game Name** — short description. (In development.)` bullet in
  both READMEs. Replace it with the linked format when the public URL exists.
- Preserve release tarball names and public API compatibility when moving files.

## Verification

- Use Node 24 and npm. Run `npm ci`, `npm run typecheck`, and `npm test`.
- Test client packaging after changing its location or release scripts.
- Live integration checks require an otherwise empty drawing session.
- Do not deploy, publish a release, or create a pull request unless requested.

## OpenSpec records and planning

- Use the installed global OpenSpec skills for planning work in this order:
  Explore, Propose, optional Update, then Apply.
- Do not install or generate repository-local OpenSpec skills. If the required
  global skill is unavailable, stop and ask the user before choosing another
  process.
- `openspec/` preserves earlier proposals, designs, tasks, and specifications.
  It is maintenance history, not a game-creation dependency or an automatic
  workflow trigger. Read a record only when it is relevant to the requested
  work.

## Strict TypeScript ownership

- Author application, browser client/rules, tests, probes, configuration and workflow tools in `.ts`/`.tsx`. Keep emitted `.js`/`.d.ts` in ignored `dist/` trees; never hand-maintain declaration companions.
- `tsconfig.json` owns the Node server, `tsconfig.client.json` owns browser modules (DOM libraries, no Node globals), and `tsconfig.tools.json` owns tests and scripts. All extend `tsconfig.base.json` with strict checking, checked indexing, exact optional properties, override checking, verbatim modules and consistent casing.
- Run `npm run check:typescript-source` before `npm run typecheck`. The Git inventory includes tracked and nonignored untracked files; only dependency/generated directories are excluded. Add new first-party files to an owning compiler configuration.
- `npm run build` gates production output on coverage, all compilers and tests. `npm run verify:tools` checks local CLI fixtures; `npm run verify:client-package` verifies every public import from the exact locally packed artifact with Bundler, NodeNext and loader-free JavaScript. Run `npm run build:client` before packing in each clean job.
- Browser automation must run headlessly without visible windows. Use minimized windows only when the automation API explicitly supports them and headless operation is unavailable. Never open headed windows for routine tests.

## Required language for all updates

Every contributor, human or AI, MUST keep this repository in strict TypeScript for every change, regardless of scope. This applies to server code, every registered game and simulation, the shared client and rules, tests, probes, release/deployment tools and future additions. Author executable code in .ts/.tsx and keep it in the compiler/source-coverage checks. Do not introduce authored JavaScript, handwritten declaration substitutes or weaker compiler gates. Generated JavaScript/declarations, third-party dependencies and native shell orchestration remain permitted.

Production builds run the full regression suite with `npm run test:local`. This checked runner removes Vercel mode, remote test endpoints, game-only filters and production Blob credentials from its child environment so tests start isolated local servers during Vercel builds. `npm test` retains its existing SERVER_URL contract for explicit public checks. This changes test orchestration only, not deployed runtime environment handling.

The server compiler explicitly retains the ES2022 standard library even when a hosting builder overrides the emitted JavaScript target. Keep that library setting aligned with Node 24 APIs; changing emit targets must not remove their types.
