'use client';

import { useEffect } from 'react';

/**
 * VersionCheck — Auto-refresh the page when a new version is deployed.
 * 
 * Reads the version from package.json at build time and stores it in the DOM.
 * On client load, checks if the version changed (via a new build manifest).
 * If changed, auto-refreshes the page to load the new frontend.
 */

const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || 'unknown';

export default function VersionCheck() {
  useEffect(() => {
    // Store current version in sessionStorage
    const storedVersion = sessionStorage.getItem('app_build_id');
    
    if (!storedVersion) {
      // First load, just store the version
      sessionStorage.setItem('app_build_id', BUILD_VERSION);
      return;
    }

    // Check if version changed (indicates new deployment)
    if (storedVersion !== BUILD_VERSION) {
      console.log(`[VersionCheck] Version changed from ${storedVersion} to ${BUILD_VERSION}. Reloading...`);
      // New version deployed, refresh the page
      window.location.reload();
    }
  }, []);

  return null; // This component doesn't render anything
}
