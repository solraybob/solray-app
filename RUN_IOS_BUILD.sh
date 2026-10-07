#!/bin/bash
# Prepare the existing iOS project for an App Store build (see
# CAPACITOR_RUNBOOK.md). Works on the committed ios/ project: it never runs
# `cap add`, never commits and never pushes.
set -euo pipefail

cd "$(dirname "$0")"

echo "Solray iOS build prep"
echo

if [ ! -d ios/App/App.xcodeproj ]; then
  echo "ios/App/App.xcodeproj is missing. The iOS project is committed in git;"
  echo "restore it with git rather than running 'npx cap add ios'."
  exit 1
fi

echo "1. Installing JS dependencies"
npm install

CAP_VERSION="$(node -p "require('@capacitor/ios/package.json').version")"
echo "   @capacitor/ios ${CAP_VERSION}"
case "$CAP_VERSION" in
  6.2.2|6.2.[3-9]*) ;;
  *) echo "   Expected Capacitor 6.2.2 or a later 6.2 patch. Stop and check package.json."; exit 1 ;;
esac

echo "2. Syncing native project (config, plugins, pod install)"
npx cap sync ios

PBX=ios/App/App.xcodeproj/project.pbxproj
BUILD="$(grep -m1 'CURRENT_PROJECT_VERSION' "$PBX" | sed 's/[^0-9]//g')"
VERSION="$(grep -m1 'MARKETING_VERSION' "$PBX" | sed 's/.*= //; s/;//')"
echo "3. Project version ${VERSION} (${BUILD})"
if [ "$(grep -c 'CURRENT_PROJECT_VERSION = '"$BUILD"';' "$PBX")" != "2" ]; then
  echo "   Debug and Release build numbers differ. Fix in Xcode before archiving."
  exit 1
fi

echo "4. Checking Xcode and SDK"
if command -v xcodebuild >/dev/null 2>&1; then
  xcodebuild -version | head -1
  SDK="$(xcodebuild -showsdks 2>/dev/null | grep -o 'iphoneos[0-9.]*' | sort -V | tail -1)"
  echo "   newest iOS SDK: ${SDK:-none}"
  case "$SDK" in
    iphoneos2[6-9]*|iphoneos[3-9][0-9]*) ;;
    *) echo "   App Store uploads need Xcode 26 / iOS 26 SDK or newer." ;;
  esac
else
  echo "   xcodebuild not found (not on a Mac?)"
fi

echo
echo "Next: CAPACITOR_RUNBOOK.md sections 3 to 9 (signing, push profile,"
echo "device test, archive, privacy report, TestFlight, submission)."
echo "Commit ios/App/Podfile.lock if pod install changed it."
if command -v xcodebuild >/dev/null 2>&1; then
  npx cap open ios
fi
