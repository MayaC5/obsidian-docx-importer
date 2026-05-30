#!/bin/bash
set -e

VERSION=$(node -p "require('./manifest.json').version")
TAG="v$VERSION"

echo "Releasing $TAG..."

git add -A
git commit -m "Release $TAG"
git push origin main
git tag "$TAG"
git push origin "$TAG"

echo "Done — $TAG pushed. GitHub Actions will build and attest the release."
