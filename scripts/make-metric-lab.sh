#!/usr/bin/env bash
# Generates "metric-lab": a small fixture repository with hand-verified expected
# metric values, used to check the metrics engine end to end.
#
# Usage:  bash scripts/make-metric-lab.sh
# Output: data/fixtures/metric-lab        (the repository)
#         data/fixtures/metric-lab.zip    (ready to upload, when `zip` is available)
#
# Expected results for the All-commits selection are listed in the README.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$ROOT_DIR/data/fixtures/metric-lab"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"
git init -b main -q
git config user.name "Ada Lovelace"
git config user.email "ada@example.com"

# C1 (Ada): root commit — a.txt +3, dir/b.txt +2, cafe +1, bin.bin (binary, skipped)
printf 'l1\nl2\nl3\n' > a.txt
mkdir -p dir
printf 'b1\nb2\n' > dir/b.txt
printf 'x\0y\0' > bin.bin
printf 'cafe\n' > "café.txt"
git add -A
git commit -qm "C1 initial"

# C2 (Ada): mailmap added (+1)
printf 'Ada Lovelace <ada@example.com> Ada L <ada2@example.com>\n' > .mailmap
git add .mailmap
git commit -qm "C2 add mailmap"

# C3 (Ada L via ada2@example.com — must be mailmapped to Ada Lovelace): a.txt +1, dir/b.txt +1
git config user.name "Ada L"
git config user.email "ada2@example.com"
printf 'l4\n' >> a.txt
printf 'b3\n' >> dir/b.txt
git add -A
git commit -qm "C3 edits"

# C4 (Grace): pure rename a.txt -> a2.txt (0/0, no metric impact)
git config user.name "Grace Hopper"
git config user.email "grace@example.com"
git mv a.txt a2.txt
git commit -qm "C4 pure rename"

# C5 (Grace): rename + edit a2.txt -> dir/a2.txt with +1 line (attributed to NEW path)
printf 'l5\n' >> a2.txt
git mv a2.txt dir/a2.txt
git add -A
git commit -qm "C5 rename with edit"

# C6 (Grace): delete dir/b.txt (-3, removal recorded on old path)
git rm -q dir/b.txt
git commit -qm "C6 delete b.txt"

# C7 (Ada): binary file change (skipped by -/-, zero impact)
git config user.name "Ada Lovelace"
git config user.email "ada@example.com"
printf 'z\0w\0' > bin.bin
git add -A
git commit -qm "C7 binary change"

# C8 (Ada): feature branch commit, reachable via merge — counted (non-merge) dir/deep.txt +1
git checkout -qb feature
printf 'f1\n' > dir/deep.txt
git add -A
git commit -qm "C8 feature commit"

# C9 (merge): must be excluded from the commit set
git checkout -q main
git merge -q --no-ff feature -m "C9 merge (excluded)"

# C10 (Ada): empty commit — no file changes
git commit -q --allow-empty -m "C10 empty commit"

echo "FIXTURE READY: $OUT_DIR"
git log --oneline --graph --all

ZIP="$ROOT_DIR/data/fixtures/metric-lab.zip"
if command -v zip >/dev/null 2>&1; then
  rm -f "$ZIP"
  zip -qr "$ZIP" . -x '*.DS_Store'
  echo "ZIP READY: $ZIP"
else
  echo "note: no 'zip' command found — archive the folder (including .git) manually for upload"
fi
