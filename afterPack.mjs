import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export default async function signEngineBinaries(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const mac = context.packager.platformSpecificBuildOptions || {};
  const rawIdentity = mac.identity;
  if (!rawIdentity) {
    console.warn('[afterPack] no mac.identity configured; skipping engine binary signing');
    return;
  }
  const identity = /^Developer ID/i.test(rawIdentity)
    ? rawIdentity
    : `Developer ID Application: ${rawIdentity}`;

  const appName = context.packager.appInfo.productFilename;
  const resourcesBin = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources', 'bin');
  const entitlements = path.resolve('bin/entitlements.mac.inherit.plist');

  for (const name of ['swap', 'asb']) {
    const bin = path.join(resourcesBin, name);
    if (!fs.existsSync(bin)) {
      console.warn(`[afterPack] ${name} not found at ${bin}; skipping (engine not bundled in this build)`);
      continue;
    }
    console.log(`[afterPack] codesigning ${name} with "${identity}"`);
    execFileSync(
      'codesign',
      [
        '--force',
        '--timestamp',
        '--options',
        'runtime',
        '--entitlements',
        entitlements,
        '--sign',
        identity,
        bin,
      ],
      { stdio: 'inherit' },
    );
  }

  console.log('[afterPack] engine binaries signed');
}
