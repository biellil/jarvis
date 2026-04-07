/**
 * LangChain.js version validation.
 *
 * Validates that all @langchain/* packages use compatible versions of @langchain/core.
 * Prevents obscure runtime errors from peer dependency mismatches (per D-15, D-16).
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';

// Create require function for ESM context
const require = createRequire(import.meta.url);

export interface VersionCheckResult {
  valid: boolean;
  coreVersion?: string;
  message: string;
  packages?: Record<string, string>;
}

/**
 * Validate that all installed LangChain.js packages use compatible @langchain/core versions.
 *
 * Checks peer dependency requirements of @langchain/openai and @langchain/anthropic
 * against the installed @langchain/core version.
 *
 * @returns Validation result with version details
 */
export async function validateLangChainVersions(): Promise<VersionCheckResult> {
  const packages = ['@langchain/core', '@langchain/openai', '@langchain/anthropic'];
  const versions: Record<string, string> = {};

  // Read each package's version from package.json
  for (const pkg of packages) {
    try {
      const pkgJsonPath = require.resolve(`${pkg}/package.json`);
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      versions[pkg] = pkgJson.version;

      // Check peer dependency requirements
      if (pkg !== '@langchain/core' && pkgJson.peerDependencies?.['@langchain/core']) {
        versions[`${pkg}:requires`] = pkgJson.peerDependencies['@langchain/core'];
      }
    } catch (error) {
      return {
        valid: false,
        message: `Failed to resolve ${pkg}: ${(error as Error).message}`
      };
    }
  }

  // Validate all packages use compatible core version
  const coreVersion = versions['@langchain/core'];
  const coreMajor = coreVersion.split('.')[0];

  // Check peer dependencies are satisfied
  const incompatible = Object.entries(versions)
    .filter(([key]) => key.endsWith(':requires'))
    .filter(([_, range]) => !satisfiesRange(coreVersion, range));

  if (incompatible.length > 0) {
    return {
      valid: false,
      coreVersion,
      packages: versions,
      message: `Core version ${coreVersion} does not satisfy: ${JSON.stringify(incompatible)}`
    };
  }

  return {
    valid: true,
    coreVersion,
    packages: versions,
    message: `All packages use compatible @langchain/core ${coreVersion}`
  };
}

/**
 * Simplified semver range check for major version compatibility.
 * Checks if version satisfies a peer dependency range.
 *
 * @param version - Installed version (e.g., "1.1.39")
 * @param range - Peer dependency range (e.g., "^1.0.0" or ">=1.0.0")
 * @returns True if version satisfies range
 */
function satisfiesRange(version: string, range: string): boolean {
  // Simplified check for major version match (1.x.x)
  const versionMajor = version.split('.')[0];
  const rangeMajor = range.replace(/[^0-9.]/g, '').split('.')[0];
  return versionMajor === rangeMajor;
}
