import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Sign the bundled swap engine binaries (swap, asb) that we drop into
// Contents/Resources/bin via extraResources. electron-builder signs the app
// bundle, but standalone Mach-O helpers in Resources must ALSO carry a
// Developer ID signature with a hardened runtime or notarization rejects the
// whole app. afterPack runs after the .app is assembled but before the app is
// signed/notarized, so signing them here (and letting the later app-signing
// pass re-sign consistently) guarantees every Mach-O is covered.
export default async function signEngineBinaries(context) {
  // macOS only; nothing to sign on Windows/Linux here.
  if (context.electronPlatformName !== 'darwin') return;

  const mac = context.packager.platformSpecificBuildOptions || {};
  // Config identity is e.g. "Harry Eriksson (JPZ73847LL)"; codesign needs the
  // full Developer ID Application common name. If a full name is already given
  // (or resolved via CSC), use it as-is.
  const rawIdentity = mac.identity;
  if (!rawIdentity) {
    console.warn('[afterPack] no mac.identity configured; skipping engine binary signing');
    return;
  }
  const identity = /^Developer ID/i.test(rawIdentity)
    ? rawIdentity
    : `Developer ID Application: ${rawIdentity}`;

  const appName = context.packager.appInfo.productFilename; // "Aesir"
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
