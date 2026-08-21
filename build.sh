#!/bin/bash
# BetterBaguio — Production Build Script
# Usage:
#   bash build.sh            — bump patch, build everything
#   bash build.sh --no-bump  — keep current version, build everything
#   bash build.sh minor      — bump minor, build everything
#   bash build.sh major      — bump major, build everything

set -e

BUMP_TYPE="patch"
SKIP_BUMP=false
REACT_BUILD=false

for arg in "$@"; do
    case $arg in
        --no-bump) SKIP_BUMP=true ;;
        --no-react) REACT_BUILD=false ;;
        major|minor|patch) BUMP_TYPE=$arg ;;
    esac
done

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   BetterBaguio — Production Build        ║"
echo "╚══════════════════════════════════════════╝"

# ── 0. Build-time configuration (optional .env, see .env.example) ────────────
# Exported so the React build inherits SITE_URL. The file is git-ignored and
# excluded from dist/, so nothing here reaches the served output directly.
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    echo ""
    echo "▶ [0/6] Loaded .env (SITE_URL=${SITE_URL:-unset})"
fi

# ── 1. Version (single source of truth: version.json) ────────────────────────
echo ""
echo "▶ [1/6] Version management..."
if [ "$SKIP_BUMP" = false ]; then
    # bump-version.js: updates version.json → package.json → all HTML files
    #                  → react-app/public/version.json
    node scripts/bump-version.js "$BUMP_TYPE"
else
    echo "  Skipping bump (--no-bump). Current: $(node -e "console.log(require('./version.json').version)")"
fi

VERSION=$(node -e "console.log(require('./version.json').version)")

# ── 2. Clean dist ────────────────────────────────────────────────────────────
echo ""
echo "▶ [2/6] Cleaning dist/..."
rm -rf dist
mkdir -p dist

# ── 3. Copy legacy site (rsync excludes dev-only files) ──────────────────────
echo ""
echo "▶ [3/6] Copying legacy site files..."
if command -v rsync &>/dev/null; then
    rsync -a \
        --include='assets/css/better-baguio.css' \
        --exclude='assets/css/*' \
        --include='assets/js/site-shell.js' \
        --exclude='assets/js/*' \
        --include='assets/images/logo/better-baguio-mark.png' \
        --exclude='assets/images/logo/*' \
        --exclude='assets/betterbaguio-logo.png' \
        --exclude='assets/betterbaguio-logo-text.png' \
        --exclude='assets/images/banners' \
        --exclude='assets/animation' \
        --exclude='data' \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.git' \
        --exclude='.vscode' \
        --exclude='.DS_Store' \
        --exclude='react-app' \
        --exclude='admin' \
        --exclude='service-details' \
        --exclude='news' \
        --exclude='faq' \
        --exclude='privacy' \
        --exclude='terms' \
        --exclude='accessibility' \
        --exclude='sitemap' \
        --exclude='offline.html' \
        --exclude='government/officials.html' \
        --exclude='legislative/ordinance-framework.html' \
        --exclude='legislative/resolution-framework.html' \
        --exclude='services/agriculture.html' \
        --exclude='services/business.html' \
        --exclude='services/certificates.html' \
        --exclude='services/education.html' \
        --exclude='services/environment.html' \
        --exclude='services/health.html' \
        --exclude='services/infrastructure.html' \
        --exclude='services/public-safety.html' \
        --exclude='services/social-services.html' \
        --exclude='services/tax-payments.html' \
        --exclude='backup-restore-point-*' \
        --exclude='package*.json' \
        --exclude='build.sh' \
        --exclude='babel.config.json' \
        --exclude='serve.py' \
        --exclude='scripts' \
        --exclude='docs' \
        --exclude='*.backup' \
        --exclude='*.md' \
        --exclude='.lighthouserc.json' \
        --exclude='.github' \
        --exclude='.gitignore' \
        --exclude='validate-translations.js' \
        --exclude='tests' \
        --exclude='playwright.config.js' \
        --exclude='playwright-report' \
        --exclude='test-results' \
        --exclude='.prettierrc' \
        --exclude='.prettierignore' \
        --exclude='.editorconfig' \
        --exclude='.env' \
        --exclude='.env.*' \
        --exclude='release' \
        --exclude='*.zip' \
        --exclude='*.tar.gz' \
        --exclude='*.log' \
        . dist/
else
    # Fallback: cross-platform Node.js copy (Windows / no rsync)
    node scripts/copy-dist.js . dist
fi
echo "  Legacy files copied."

# ── 4. Build React app and merge health page ──────────────────────────────────
echo ""
echo "▶ [4/6] React app build..."
if [ "$REACT_BUILD" = true ] && [ -f "react-app/package.json" ]; then
    (
        cd react-app
        echo "  Installing dependencies..."
        npm ci --prefer-offline 2>/dev/null || npm install --silent
        echo "  Running next build..."
        npm run build
    )

    # _next contains all JS chunks and static assets for React pages
    if [ -d "react-app/out/_next" ]; then
        echo "  Merging React static assets → dist/_next/"
        cp -r react-app/out/_next dist/_next
    fi

    # Merge only React-owned routes into dist (do not overwrite legacy pages)
    # Currently: /services/health is the only React-served route in production
    if [ -f "react-app/out/services/health.html" ]; then
        echo "  Merging health page → dist/services/health.html"
        cp react-app/out/services/health.html dist/services/health.html
    fi

    echo "  React build merged."
elif [ "$REACT_BUILD" = false ]; then
    echo "  Skipped (--no-react)."
else
    echo "  Skipped (react-app/package.json not found)."
fi

# ── 5. Minify assets ─────────────────────────────────────────────────────────
echo ""
echo "▶ [5/6] Minifying assets..."

echo "  HTML..."
find dist -name "*.html" -not -path "dist/_next/*" -type f | while read -r file; do
    npx --yes html-minifier-terser \
        --collapse-whitespace \
        --remove-comments \
        --remove-optional-tags \
        --remove-redundant-attributes \
        --remove-script-type-attributes \
        --remove-style-link-type-attributes \
        --minify-css true \
        --minify-js true \
        -o "$file" "$file" 2>/dev/null || true
done

echo "  CSS..."
find dist/assets/css -name "*.css" -type f 2>/dev/null | while read -r file; do
    npx --yes cleancss -o "$file" "$file" 2>/dev/null || true
done

echo "  JavaScript (transpile + minify)..."
find dist/assets/js -name "*.js" -type f 2>/dev/null | while read -r file; do
    npx --yes babel "$file" --out-file "$file" 2>/dev/null || true
    npx --yes terser "$file" -o "$file" --compress --mangle 2>/dev/null || true
done

echo "  Assets minified."

# ── 6. cPanel file permissions (755 dirs / 644 files) ────────────────────────
echo ""
echo "▶ [6/6] Setting cPanel file permissions..."
find dist -type d -exec chmod 755 {} \;
find dist -type f -exec chmod 644 {} \;
echo "  Directories: 755 | Files: 644"

# ── Summary ───────────────────────────────────────────────────────────────────
ORIG_SIZE=$(du -sh . --exclude=node_modules --exclude=dist --exclude=.git --exclude="react-app/node_modules" 2>/dev/null | cut -f1 || echo "N/A")
DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1 || echo "N/A")

echo ""
echo "╔══════════════════════════════════════════╗"
printf  "║  ✓ Build complete!  v%-20s║\n" "${VERSION}"
echo "╠══════════════════════════════════════════╣"
printf  "║  Source: %-31s║\n" "${ORIG_SIZE}"
printf  "║  Dist:   %-31s║\n" "${DIST_SIZE}"
echo "╠══════════════════════════════════════════╣"
echo "║  Upload dist/ → cPanel public_html/     ║"
echo "║  Preview: cd dist && python3 -m http.server 8080  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
