#!/bin/bash

echo "🔧 Fixing Electron installation..."
echo ""

# Navigate to project root
cd "$(dirname "$0")"
echo "📁 Current directory: $(pwd)"
echo ""

# Clean pnpm store
echo "🧹 Cleaning pnpm store..."
pnpm store prune
echo ""

# Remove node_modules
echo "🗑️  Removing node_modules..."
rm -rf node_modules
rm -rf apps/desktop/node_modules
echo ""

# Approve build scripts for Electron and esbuild
echo "🔓 Approving build scripts for Electron..."
pnpm config set enable-pre-post-scripts true
echo ""

# Reinstall dependencies with scripts enabled
echo "📦 Reinstalling dependencies (this may take a few minutes)..."
pnpm install --ignore-scripts=false
echo ""

# Manually run Electron install script if needed
echo "⚡ Running Electron post-install..."
cd node_modules/.pnpm/electron@*/node_modules/electron 2>/dev/null || cd node_modules/electron
node install.js
cd "$(dirname "$0")"
echo ""

# Verify Electron installation
echo "✅ Verifying Electron installation..."
cd apps/desktop
if pnpm exec electron --no-sandbox --version; then
    echo ""
    echo "✨ Electron installed successfully!"
    echo ""
    echo "🚀 You can now run: cd apps/desktop && pnpm dev"
else
    echo ""
    echo "❌ Still having issues. Let me know and we'll try another approach."
fi
