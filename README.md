# RAT — Repository Analysis Tool

A web dashboard for analysing git repositories. Upload a zipped repository (including its
`.git` directory) or clone one from a URL, then explore file, directory, repository,
commit-set and author metrics — filtered by repository, author, file/directory and commit set.

Built for the COMS3011A SDP test.

## Requirements

- **Node.js 18 or newer** (with npm)
- **git** on your `PATH` — the analysis engine shells out to the git CLI
- A modern browser (Chrome, Firefox, Edge)

## Getting started

### 1. Clone and install

```bash
git clone <this-repository-url>
cd SDP-test1
npm install
```

`npm install` installs everything (the repo is an npm-workspaces monorepo: `server/` + `client/`).

### 2. Run in development mode

```bash
npm run dev
```

This starts both processes:

- **API server** on <http://localhost:3001>
- **Web client** on <http://localhost:5173> (the dev server proxies `/api` to the API)

Open **<http://localhost:5173>**.

### 3. Production build (single port)

```bash
npm run build
npm start
```

Open **<http://localhost:3001>** — the server also serves the built client.

To reset the application state, stop the server and delete the `data/` directory.

## Using the app

1. **Add a repository** with the “+ Add repository” button:
   - **Upload zip** — select a `.zip` of a repository folder **including the `.git` directory**.
     To create one: `cd /path/to/repo && zip -r ../myrepo.zip .`
     (uploads are capped at 2 GB)
   - **Clone URL** — paste an `https://`, `http://`, `git://`, `ssh://` or `git@host:path` URL.
     The app performs a full (non-shallow) clone so the entire history is analysed.
     Large repositories can take several minutes to clone (15-minute timeout).
2. **Select a repository** in the sidebar. Multiple repositories can be added; delete one with ✕.
3. Use the three tabs:
   - **Metrics** — the analysis dashboard (default).
   - **Authors** — merge author identities, rename groups, unmerge.
   - **Details** — repository snapshot (HEAD, branch, last commit).

### Metrics tab

- **Commit set** — one of:
  - *All commits* (every commit in the index),
  - *Date range* — committer date, `From` inclusive / `To` exclusive,
  - *Choose commits…* — manual selection via a picker with search (hash, subject, author) and paging.
- **Author** — restrict metrics to one author (after `.mailmap` and manual merges).
- **Path** — restrict to a file or directory prefix; directory rows in the table can be clicked
  to drill down, with a breadcrumb to navigate back up.
- **Show** — files & directories, files only, or directories only.
- **Summary cards** show the repository-wide metrics for the current selection.
- The **table** lists the root (repository) plus every touched object, with sortable columns
  (Added, Removed, Growth, Churn, Mods, Freq η, Rate ρ, Path). Expand a row (▸) for the
  per-author breakdown of modifications, churn and ownership.
- The **author chips** under the summary filter by author in one click.

### Authors tab

`.mailmap` files inside the repository are applied automatically when indexing. For identities
git could not resolve (same person under different names/emails), select two or more entries in
“Identities in history”, optionally give the merged identity a display name, and press
“Merge selected”. Merged groups can be renamed or unmerged; the metrics update immediately.

## Metrics reference

Metrics follow the project specification (sections 2.1–2.5).

**Commit model.** The analysed commit set **H** consists of the non-merge commits reachable
from `HEAD`. Each commit's line changes are measured against its previous commit (its first
parent; the initial commit is measured against the empty tree). Renames are detected with a 50%
similarity threshold (`-M50%`) and attributed to the **new** path; deletions record their
removed lines on the old path; binary files are excluded; merges are excluded; `.mailmap` is
applied and manual author merges are layered on top.

| Metric | Symbol | Definition |
| --- | --- | --- |
| Added lines | l⁺ | lines added to a file in a commit vs. its previous commit |
| Removed lines | l⁻ | lines removed from a file in a commit |
| Growth | δ = l⁺ − l⁻ | net line change |
| Churn | λ = l⁺ + l⁻ | total changed lines |
| Modifications | n | commits in H with churn > 0 on the object |
| Modification frequency | η = n / \|H\| | modifications per commit in the set |
| Churn rate | ρ = λ / \|H\| | churn per commit in the set |
| Author modifications | n(a) | modifications where the commit's author is a |
| Author churn | λ(a) | churn from commits whose author is a |
| Ownership | ω = λ(a) / λ | author a's share of the object's churn |

**Directory metrics** are the sum over the directory **and everything below it** (the spec's
recursive formula over immediate children); a directory row therefore includes its entire
subtree. **Repository metrics** are the directory metrics at the root of the commit tree, shown
as the `root (repository)` row and in the summary cards.

## Configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | API port used by `npm start` (the dev proxy assumes 3001) |
| `RAT_DATA_DIR` | `./data` | where uploaded/cloned repositories and caches are stored |
| `RAT_MAX_COMMITS` | `200000` | max commits indexed per repository (most recent kept; the header warns when truncated) |

## Verifying the metrics engine

`scripts/make-metric-lab.sh` builds a small fixture repository designed to exercise every edge
case (initial commit, mailmap collapse, pure rename, rename+edit, deletion, binary file, merge
commit, empty commit):

```bash
bash scripts/make-metric-lab.sh
```

It writes `data/fixtures/metric-lab/` and, when the `zip` command is available,
`data/fixtures/metric-lab.zip` ready for upload.

Expected values for the default *All commits* selection (also hand-computed in the script):

| Metric | Expected |
| --- | --- |
| Commits in set (\|H\|) | 9 (10 commits minus the merge) |
| Added / Removed lines | 11 / 3 |
| Growth / Churn | +8 / 14 |
| Modifications (n) | 6 (pure rename, binary and empty commits do not count) |
| Modification frequency (η) | 6⁄9 ≈ 0.67 |
| Churn rate (ρ) | 14⁄9 ≈ 1.56 |
| Ada Lovelace | 6 commits, churn 10, ownership ≈ 71% |
| Grace Hopper | 3 commits, churn 4, ownership ≈ 29% |

Edge cases to spot in the table: `bin.bin` is absent (binary), the rename-only file shows an
all-zero row, `dir/b.txt` shows balanced +3/−3 growth 0, and the merge commit's changes are
excluded.

## Project structure

```
server/    Express + TypeScript API: repository storage, git indexer, metrics engine
client/    React + TypeScript single-page app (Vite)
scripts/   Developer tooling (metrics fixture generator)
data/      Runtime state (gitignored): uploaded/cloned repositories, indexes, caches
```

## Tech stack

- **Backend** — Node.js, Express, TypeScript. Git itself is the analysis engine: history is
  read with a single streaming `git log --no-merges --use-mailmap -M50% --numstat -z` pass and
  cached per repository as JSON.
- **Frontend** — React 18, TypeScript, Vite. No UI framework; hand-rolled dark theme.
- **Storage** — no database; repository metadata, the commit index and author merges are JSON
  files under `data/repos/<id>/`.
