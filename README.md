# Language Coach

<p align="center">
  <img src="./packages/plugin/scaffold/assets/icon.png" alt="Language Coach icon" width="180">
</p>

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
- Lets users opt into registration, verified-email login, and remote sync.
- Stores remote notes in Neon Postgres through Cloudflare Hyperdrive.
- Enforces account ownership in both the Worker API and Postgres row-level security policies.
- Deploys the authenticated dashboard as a Cloudflare Worker website.
- Avoids saving unrelated task context, files, or task answers.

## Installation

### Install in the Codex app

1. Open the **Plugins** tab.
2. Click the **Add** button in the top-right corner of the Plugins page.
3. In the **Add plugin marketplace** dialog, enter:
   - **Source:** `git@github.com:jackeydou/codex-lang-coach.git`
   - **Git ref:** `marketplace`
   - **Sparse paths:** leave empty
4. Click **Add marketplace**.
5. Find **Language Coach** in the added marketplace and install it.

![Add plugin marketplace dialog](./resources/add-codex-marketplace.png)

Because this repository is private, Git must be authenticated as a GitHub account that can read it.
Review and trust the plugin hooks after installation, then start a new Codex task so the plugin
runtime is loaded.

### Install from the CLI

Add the generated `marketplace` branch, then install the plugin:

```bash
codex plugin marketplace add jackeydou/codex-lang-coach --ref marketplace
codex plugin add language-coach@language-coach
```

The full Git URL works too:

```bash
codex plugin marketplace add https://github.com/jackeydou/codex-lang-coach.git --ref marketplace
```

### Install in Claude Code

Add the generated Claude Code marketplace branch, then install the plugin:

```bash
claude plugin marketplace add jackeydou/codex-lang-coach@marketplace-cc
claude plugin install language-coach@language-coach
```

The `marketplace-cc` branch uses Claude Code's native `.claude-plugin/plugin.json`, `.mcp.json`,
and `hooks/hooks.json` layout. It is built separately from the portable Agent Plugins package.

### Install from a release archive

Download and extract the ZIP or tar.gz marketplace bundle from the
[latest GitHub release](https://github.com/jackeydou/codex-lang-coach/releases/latest).
Then install the extracted directory as a local marketplace:

```bash
codex plugin marketplace add /path/to/language-coach-marketplace-v0.1.3
codex plugin add language-coach@language-coach
```

Codex cannot use the GitHub Release ZIP URL directly. It must receive the extracted local directory
or the Git repository URL shown above.


## How to use it

1. Enable plugin hooks after you install it;
<img width="1338" height="606" alt="image" src="https://github.com/user-attachments/assets/82c08958-2963-440f-a4f2-dcc3711b2864" />

2. Then you can chat with your codex, now codex will correct and polish your message and save English notes into local sqlite
3. Let your codex "Open the Language Coach dashboard", then you can see your English notes and your activities;

<table>
  <tr>
    <td width="50%" valign="top">
      <img
        src="https://github.com/user-attachments/assets/38552109-97db-4108-be5e-385bbe7c4e1a"
        alt="Image 1"
        width="100%"
      />
    </td>
    <td width="50%" valign="top">
      <img
        src="https://github.com/user-attachments/assets/3f66a3c5-e82d-4d91-8c9a-84dd58aa1b9b"
        alt="Image 2"
        width="100%"
      />
    </td>
  </tr>
</table>

## Architecture

The pnpm workspace separates product source code from the assembled Codex plugin:

```text
agent-plugin-lang-coach/
├── apps/
│   ├── dashboard/          # React and Vite dashboard
│   ├── server/             # Local Node.js runtime and HTTP API
│   └── worker/             # Remote API, Neon migration, and Cloudflare deployment
├── packages/
│   ├── core/               # Domain types, storage, and shared logic
│   ├── mcp/                # MCP schemas, tools, and handlers
│   └── plugin/             # Source-only Agent Plugins 1.0.0 scaffold
├── scripts/
│   ├── build-plugin.mjs    # Assembles the Agent Plugins distribution
│   └── build-plugin-cc.mjs # Assembles the Claude Code distribution
├── dist/
│   └── language-coach/     # Generated Agent Plugins distribution
├── dist-cc/
│   └── language-coach/     # Generated Claude Code distribution
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

The package boundaries are intentional:

- `@language-coach/core` owns the data model, SQLite adapter, and business rules.
- `@language-coach/mcp` defines transport-independent MCP tools and handlers.
- `@language-coach/server` owns process startup, MCP stdio transport, the dashboard API, static assets, and graceful shutdown.
- `@language-coach/dashboard` owns the browser interface.
- `@language-coach/worker` owns the authenticated remote API and Hyperdrive connection.
- `@language-coach/plugin` contains only the source scaffold needed to assemble the plugin variants.

Generated artifacts live in `dist/language-coach` and `dist-cc/language-coach`. Source projects must not write build output into the plugin scaffold.

## Requirements

- Node.js 22.5 or newer
- pnpm 11 or newer

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

Build the Claude Code variant separately:

```bash
pnpm build:plugin:cc
```

This assembles a clean, self-contained distribution at `dist-cc/language-coach`.

## Mise tasks

[`mise.toml`](./mise.toml) pins Node and pnpm and provides shortcuts for the common project workflows:

```bash
mise install
mise tasks ls
mise run dev
mise run build:cc
mise run verify
mise run worker:dev
```

Machine-specific paths and secrets belong in the gitignored `mise.local.toml`. Uncomment and fill in `LANGUAGE_COACH_REMOTE_URL` or `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` there when remote sync or local Hyperdrive access is needed.

## Local dashboard

Run the built dashboard:

```bash
pnpm dashboard
```

The server starts at `http://localhost:43127` by default. If the port is occupied, it tries the next available port through `43146`.

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

## Cloudflare sync and hosting

The hosted dashboard uses Cloudflare Workers Static Assets, Cloudflare Hyperdrive, Neon Postgres, and Neon Auth. Users can register with email and password or continue with Google or GitHub. Email/password accounts confirm their email before the hosted API returns any learning data.

Remote tables contain a `user_id` on every row. The Worker derives that ID from a verified Neon JWT or a hashed local-device sync token, sets it in the Postgres transaction, and row-level security enforces the same ownership rule in the database. The Hyperdrive connection must use the limited `language_coach_app` role rather than `neondb_owner`, because owner roles bypass RLS.

Local use remains account-free by default. Open **Settings → Login & sync** to register or sign in and upload the local notes for that account. The local device credential is stored at `~/.language-coach/remote-sync.json` with owner-only permissions. Turning sync off re-authenticates, revokes the remote device tokens, and removes the local credential. Deletion tombstones prevent deleted notes from reappearing during a later merge.

### Provision Neon and Hyperdrive

1. Create a Neon project and enable Neon Auth for its main branch.
2. Enable email/password registration, require email verification, and add the local and deployed dashboard URLs as trusted origins.
3. Enable Google and GitHub OAuth for the branch. Google can use Neon's shared credentials while developing; GitHub requires a GitHub OAuth app. For production, use your own credentials for both providers and register `{NEON_AUTH_URL}/callback/google` and `{NEON_AUTH_URL}/callback/github` as their provider callback URLs.
4. Create a non-owner Postgres role named `language_coach_app` with a strong password.
5. Apply [`apps/worker/migrations/0001_neon.sql`](./apps/worker/migrations/0001_neon.sql) as `neondb_owner`.
6. Create a Cloudflare Hyperdrive configuration from the direct, unpooled Neon connection string for `language_coach_app`.
7. Put the Hyperdrive configuration ID and Neon Auth URL in [`apps/worker/wrangler.jsonc`](./apps/worker/wrangler.jsonc).

Set `NEON_PRODUCTION_DATABASE_URL` in the gitignored `mise.local.toml` to a direct, unpooled owner/admin connection string. Apply pending production migrations with:

```bash
mise run db:migrate:production
```

The task asks for confirmation, verifies the limited runtime role, and records each applied file from `apps/worker/migrations`. Do not use the `language_coach_app` connection for migrations.

For local Worker development, set the documented Hyperdrive override without committing it:

```bash
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE='postgresql://language_coach_app:...@.../neondb?sslmode=require'
pnpm --filter @language-coach/worker dev
```

Deploy from the repository root:

```bash
pnpm deploy:cloudflare
```

The deployed site works at `https://language-coach.pluginsfoundry.dev`. The built local dashboard remains available at `http://localhost:43127`. Set `LANGUAGE_COACH_REMOTE_URL` only when the local build should discover a different deployed Worker.

## Language settings

The default language pair is Chinese to English. The native language, target language, and coaching status can be changed from the dashboard or through the `update_language_profile` MCP tool.

Disabling coaching stops prompt injection and note enforcement. Existing notes remain available until they are explicitly deleted.

## Plugin distribution

The default build follows Agent Plugins 1.0.0 and produces this self-contained artifact:

```text
dist/language-coach/
├── plugin.json
├── mcp.json
├── com.openai.codex/hooks/
├── skills/
├── mcp/server.mjs
└── dashboard/dist/
```

The Claude Code build produces its native layout independently:

```text
dist-cc/language-coach/
├── .claude-plugin/plugin.json
├── .mcp.json
├── hooks/
├── skills/
├── mcp/server.mjs
└── dashboard/dist/
```

The distribution must not depend on workspace imports, repository-relative source paths, TypeScript execution, or a repository-level `node_modules` directory. It should continue to work when copied outside this repository.

Pushing a version tag such as v0.1.3 runs the GitHub Actions release workflow. The workflow checks
and tests the workspace, builds the plugin, creates ZIP and tar.gz marketplace bundles, writes
SHA-256 checksums, publishes the files to GitHub Releases, and updates the generated `marketplace`
branch. The tag version must match the root package version.

The workflow can also be run manually from `master` to rebuild the `marketplace` branch without
creating another GitHub Release. The generated branch contains only the marketplace catalog and
the self-contained plugin:

```text
.agents/plugins/marketplace.json
plugins/language-coach/
```

The separate Claude Code workflow uses the same tag and manual-release conditions. It packages the
Claude Code artifact and publishes this generated tree to `marketplace-cc`:

```text
.claude-plugin/marketplace.json
plugins/language-coach/
```

## Validation

Before submitting a change, run:

```bash
pnpm install
pnpm check
pnpm test
pnpm build:plugin
pnpm build:plugin:cc
```

The resulting plugin must:

- conform to the Agent Plugins 1.0.0 manifest and MCP schemas;
- pass `claude plugin validate` for the Claude Code variant;
- starts its MCP server over stdio;
- starts the dashboard and serves its API;
- uses one shared database schema across hooks, MCP tools, and the dashboard;
- contains no source-only or workspace-dependent files; and
- runs after `dist/language-coach` is copied outside the repository.

## License

This project is licensed under the [MIT License](./LICENSE).
