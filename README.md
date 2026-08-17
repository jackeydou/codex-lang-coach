# Language Coach

Language Coach is a local-first Codex plugin that turns everyday writing into focused, reusable language lessons. It reviews the language in a prompt, highlights meaningful corrections and patterns, and stores only structured learning notes in a private local database.

The project includes a Codex plugin, an MCP interface, a local Node.js runtime, and a browser-based learning dashboard.

## Features

- Reviews grammar, spelling, collocations, word choice, tone, and contextual appropriateness.
- Produces natural target-language rewrites instead of literal translations.
- Captures reusable structures, phrases, and transfer examples.
- Tracks native-, target-, mixed-, and other-language usage.
- Provides progress summaries and correction-category trends.
- Includes a local dashboard for reviewing and deleting learning notes.
- Stores data locally in SQLite by default.
- Avoids saving unrelated task context, files, or task answers.

## Architecture

The pnpm workspace separates product source code from the assembled Codex plugin:

```text
agent-plugin-lang-coach/
├── apps/
│   ├── dashboard/          # React and Vite dashboard
│   └── server/             # Node.js runtime, HTTP API, and process entry points
├── packages/
│   ├── core/               # Domain types, storage, and shared logic
│   ├── mcp/                # MCP schemas, tools, and handlers
│   └── plugin/             # Source-only Codex plugin scaffold
├── scripts/
│   └── build-plugin.mjs    # Assembles and validates the plugin distribution
├── dist/
│   └── language-coach/     # Generated, installable plugin
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

The package boundaries are intentional:

- `@language-coach/core` owns the data model, SQLite adapter, and business rules.
- `@language-coach/mcp` defines transport-independent MCP tools and handlers.
- `@language-coach/server` owns process startup, MCP stdio transport, the dashboard API, static assets, and graceful shutdown.
- `@language-coach/dashboard` owns the browser interface.
- `@language-coach/plugin` contains only the source scaffold needed to assemble the Codex plugin.

The generated `dist/language-coach` directory is the only installable artifact. Source projects must not write build output into the plugin scaffold.

## Requirements

- Node.js 22.5 or newer
- pnpm 11 or newer

## Install from a release

Download and extract the ZIP or tar.gz marketplace bundle from the
[latest GitHub release](https://github.com/jackeydou/codex-lang-coach/releases/latest).
Then install the extracted directory as a local marketplace:

    codex plugin marketplace add /path/to/language-coach-marketplace-v0.1.0
    codex plugin add language-coach@language-coach

Review and trust the plugin hooks, then start a new Codex task so the plugin runtime is loaded.

## Development

Install dependencies:

```bash
pnpm install
```

Run the dashboard and API development processes:

```bash
pnpm dev
```

Run static checks and tests:

```bash
pnpm check
pnpm test
```

Build the complete installable plugin:

```bash
pnpm build:plugin
```

`pnpm build` is an alias for the same full plugin build. Both commands assemble a clean, self-contained distribution at `dist/language-coach`.

## Local dashboard

Run the built dashboard:

```bash
pnpm dashboard
```

The server starts at `http://127.0.0.1:43127` by default. If the port is occupied, it tries the next available port through `43146`.

Set a different starting port when needed:

```bash
LANGUAGE_COACH_PORT=44000 pnpm dashboard
```

During frontend development, Vite runs at `http://127.0.0.1:43128` and proxies API requests to the local Node.js server.

## Local plugin testing

Build the plugin before installing or refreshing it in Codex:

```bash
pnpm build:plugin
```

The repository marketplace at `.agents/plugins/marketplace.json` points to `dist/language-coach`. Install Language Coach from that marketplace, review and trust its hooks, then start a new Codex task so the refreshed plugin runtime is loaded.

## Data and privacy

Language Coach stores its database at:

```text
~/.language-coach/language-coach.sqlite
```

Override the location with an absolute path:

```bash
LANGUAGE_COACH_DB_PATH=/absolute/path/language-coach.sqlite pnpm dashboard
```

A learning note may contain:

- the original expression being coached;
- a polished target-language version;
- correction categories, replacements, and explanations;
- reusable grammar patterns, structures, collocations, or phrases;
- short transfer examples and their contexts;
- the detected input-language category;
- the active language pair, turn identifier, and timestamp.

The schema does not include fields for unrelated task details, files, or task answers. Language Coach saves a note only when an expression has a meaningful error, unnatural wording, a contextual problem, or a useful reusable pattern. Optional stylistic rewrites alone do not justify persistence.

Notes can be deleted through the dashboard or the MCP interface.

## Language settings

The default language pair is Chinese to English. The native language, target language, and coaching status can be changed from the dashboard or through the `update_language_profile` MCP tool.

Disabling coaching stops prompt injection and note enforcement. Existing notes remain available until they are explicitly deleted.

## Plugin distribution

The build produces this self-contained artifact:

```text
dist/language-coach/
├── .codex-plugin/plugin.json
├── .mcp.json
├── hooks/
├── skills/
├── mcp/server.mjs
└── dashboard/dist/
```

The distribution must not depend on workspace imports, repository-relative source paths, TypeScript execution, or a repository-level `node_modules` directory. It should continue to work when copied outside this repository.

Pushing a version tag such as v0.1.0 runs the GitHub Actions release workflow. The workflow
checks and tests the workspace, builds the plugin, creates ZIP and tar.gz marketplace bundles,
writes SHA-256 checksums, and publishes the files to GitHub Releases. The tag version must match
the root package version.

## Validation

Before submitting a change, run:

```bash
pnpm install
pnpm check
pnpm test
pnpm build:plugin
```

The resulting plugin must:

- pass the Codex plugin validator;
- starts its MCP server over stdio;
- starts the dashboard and serves its API;
- uses one shared database schema across hooks, MCP tools, and the dashboard;
- contains no source-only or workspace-dependent files; and
- runs after `dist/language-coach` is copied outside the repository.

## License

This project is licensed under the [MIT License](./LICENSE).
