#!/bin/bash
# BetterBaguio — cPanel release packager
#
# Packages dist/ into a single archive whose contents sit at the archive ROOT,
# so extracting it inside public_html/ drops the site straight into place with
# no nested folder to flatten afterwards.
#
# Usage:
#   bash scripts/package-cpanel.sh              — package existing dist/
#   bash scripts/package-cpanel.sh --build      — run build.sh first (no bump)
#
# Refuses to produce an archive if the audit below finds development files,
# local dependencies, or anything credential-shaped.

set -euo pipefail

DIST="dist"
OUT_DIR="release"
RUN_BUILD=false

for arg in "$@"; do
    case $arg in
        --build) RUN_BUILD=true ;;
    esac
done

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   BetterBaguio — cPanel Release Package  ║"
echo "╚══════════════════════════════════════════╝"

if [ "$RUN_BUILD" = true ]; then
    echo ""
    echo "▶ Running production build..."
    bash build.sh --no-bump
fi

if [ ! -d "$DIST" ]; then
    echo "✗ $DIST/ not found. Run: bash scripts/package-cpanel.sh --build" >&2
    exit 1
fi

VERSION=$(node -e "console.log(require('./version.json').version)")
STAMP=$(date +%Y%m%d)
ARCHIVE="betterbaguio-v${VERSION}-cpanel-${STAMP}.zip"

# ── 1. Scrub OS and editor droppings ─────────────────────────────────────────
echo ""
echo "▶ [1/5] Scrubbing OS artifacts..."
find "$DIST" -name '.DS_Store' -delete 2>/dev/null || true
find "$DIST" -name 'Thumbs.db' -delete 2>/dev/null || true
find "$DIST" -name '__MACOSX' -type d -exec rm -rf {} + 2>/dev/null || true
find "$DIST" -name '*.swp' -delete 2>/dev/null || true
echo "  Clean."

# ── 2. Audit: nothing development-only may ship ──────────────────────────────
echo ""
echo "▶ [2/5] Auditing for development files and credentials..."
FAILURES=0

deny() {
    # deny <find-expression...> — any match is a packaging failure
    local label="$1"; shift
    local hits
    hits=$(find "$DIST" "$@" 2>/dev/null | head -5 || true)
    if [ -n "$hits" ]; then
        echo "  ✗ $label:"
        echo "$hits" | sed 's/^/      /'
        FAILURES=$((FAILURES + 1))
    fi
}

deny "local dependencies"      -name 'node_modules' -o -name 'package-lock.json' -o -name 'package.json'
deny "version control"         -name '.git' -o -name '.gitignore' -o -name '.gitattributes'
deny "test tooling"            -name 'tests' -o -name 'playwright.config.js' -o -name 'test-results' -o -name 'playwright-report'
deny "editor/tooling config"   -name '.prettierrc' -o -name '.prettierignore' -o -name '.editorconfig' -o -name '.vscode' -o -name '.lighthouserc.json'
deny "build tooling"           -name 'build.sh' -o -name 'serve.py' -o -name 'babel.config.json' -o -name 'scripts'
deny "environment files"       -name '.env' -o -name '.env.*'
deny "documentation"           -name '*.md'
deny "nested archives"         -name '*.zip' -o -name '*.tar.gz' -o -name '*.tgz'
deny "source trees"            -name 'react-app' -o -name 'admin' -o -name 'src'
deny "OS artifacts"            -name '.DS_Store' -o -name 'Thumbs.db'

# Credential-shaped strings in anything that ships
SECRETS=$(grep -rIlE \
    "(api[_-]?key|secret|passwd|password|private[_-]?key|access[_-]?key|bearer)[\"']?\s*[:=]\s*[\"'][^\"']{8,}" \
    "$DIST" 2>/dev/null | head -5 || true)
if [ -n "$SECRETS" ]; then
    echo "  ✗ possible credentials:"
    echo "$SECRETS" | sed 's/^/      /'
    FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -gt 0 ]; then
    echo ""
    echo "✗ Audit failed with $FAILURES issue(s). No archive written." >&2
    echo "  Fix the exclude lists in build.sh and scripts/copy-dist.js, then rebuild." >&2
    exit 1
fi
echo "  No development files, dependencies, or credentials found."

# ── 3. Audit: required deployment files must be present ──────────────────────
echo ""
echo "▶ [3/5] Verifying deployment structure..."
REQUIRED=(
    ".htaccess"
    "index.html"
    "403.html" "404.html" "500.html"
    "offline.html"
    "robots.txt" "sitemap.xml"
    "manifest.webmanifest" "sw.js" "version.json"
    "assets/css/style.css"
    "assets/js/main.js"
    "assets/js/volunteer-popup.js"
    "data/services.json"
)
MISSING=0
for f in "${REQUIRED[@]}"; do
    if [ ! -e "$DIST/$f" ]; then
        echo "  ✗ missing: $f"
        MISSING=$((MISSING + 1))
    fi
done
if [ "$MISSING" -gt 0 ]; then
    echo ""
    echo "✗ $MISSING required file(s) missing. No archive written." >&2
    exit 1
fi
echo "  All ${#REQUIRED[@]} required paths present."

# ── 4. Normalise cPanel permissions ──────────────────────────────────────────
echo ""
echo "▶ [4/5] Normalising permissions (755 dirs / 644 files)..."
find "$DIST" -type d -exec chmod 755 {} \;
find "$DIST" -type f -exec chmod 644 {} \;
echo "  Done."

# ── 5. Build the archive ─────────────────────────────────────────────────────
echo ""
echo "▶ [5/5] Writing archive..."
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$ARCHIVE"

# Zipped from inside dist/ so paths are root-relative: extracting in
# public_html/ yields public_html/index.html, not public_html/dist/index.html.
# -X drops macOS extended attributes that would otherwise create __MACOSX/.
(
    cd "$DIST"
    zip -r -q -X "../$OUT_DIR/$ARCHIVE" . \
        -x '.DS_Store' -x '*/.DS_Store' -x '__MACOSX/*'
)

# Read the listing once into a variable rather than piping `unzip` into `grep -q`.
# grep -q exits on its first match, which hands unzip a SIGPIPE, and under
# `set -o pipefail` that failure becomes the pipeline's status — a race that
# reports a perfectly good archive as broken depending on output buffering.
ARCHIVE_LIST=$(unzip -l "$OUT_DIR/$ARCHIVE")

# .htaccess is the one file a bad archive silently loses — every routing,
# security and caching rule lives in it. Confirm it actually made it in.
if ! printf '%s\n' "$ARCHIVE_LIST" | grep -q '\.htaccess'; then
    echo "✗ .htaccess missing from archive — dotfiles were not included." >&2
    rm -f "$OUT_DIR/$ARCHIVE"
    exit 1
fi

FILE_COUNT=$(printf '%s\n' "$ARCHIVE_LIST" | tail -1 | awk '{print $2}')
SIZE=$(du -h "$OUT_DIR/$ARCHIVE" | cut -f1)
DIST_SIZE=$(du -sh "$DIST" | cut -f1)

if command -v shasum &>/dev/null; then
    shasum -a 256 "$OUT_DIR/$ARCHIVE" > "$OUT_DIR/$ARCHIVE.sha256"
    CHECKSUM=$(cut -d' ' -f1 < "$OUT_DIR/$ARCHIVE.sha256")
else
    CHECKSUM="(shasum unavailable)"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
printf "║  ✓ Release package ready — v%-29s║\n" "$VERSION"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  Archive:  %-46s║\n" "$OUT_DIR/$ARCHIVE"
printf "║  Size:     %-46s║\n" "$SIZE (from $DIST_SIZE unpacked)"
printf "║  Files:    %-46s║\n" "$FILE_COUNT"
printf "║  SHA-256:  %-46s║\n" "${CHECKSUM:0:46}"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Upload to cPanel → File Manager → public_html/          ║"
echo "║  then Extract. Archive contents are root-relative, so    ║"
echo "║  no nested folder needs flattening afterwards.           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
