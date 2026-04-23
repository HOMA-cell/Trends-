import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
let hasCriticalIssue = false;

const FRONTEND_FILES = [
  'index.html',
  'app.js',
  'feed.js',
  'dm.js',
  'profile.js',
  'settings.js',
  'utils.js',
  'commentSync.js',
  'supabaseClient.js',
];

const REQUIRED_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function readText(filePath) {
  return readFileSync(resolve(ROOT, filePath), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function printLine(icon, title, detail = '') {
  const suffix = detail ? ` - ${detail}` : '';
  console.log(`${icon} ${title}${suffix}`);
}

function ok(title, detail = '') {
  printLine('OK', title, detail);
}

function warn(title, detail = '') {
  printLine('WARN', title, detail);
}

function fail(title, detail = '') {
  hasCriticalIssue = true;
  printLine('FAIL', title, detail);
}

function main() {
  console.log('Trends security audit');
  console.log(`Workspace: ${ROOT}`);
  console.log('');

  const missingFiles = FRONTEND_FILES.filter(
    (filePath) => !existsSync(resolve(ROOT, filePath))
  );
  if (missingFiles.length) {
    fail('Frontend files', missingFiles.join(', '));
  } else {
    ok('Frontend files', `${FRONTEND_FILES.length} checked`);
  }

  try {
    const matches = [];
    const secretPattern = /(service_role|SUPABASE_SERVICE_ROLE|sb_secret_)/i;
    for (const filePath of FRONTEND_FILES) {
      const source = readText(filePath);
      if (secretPattern.test(source)) {
        matches.push(filePath);
      }
    }
    if (matches.length) {
      fail('Frontend secret scan', matches.join(', '));
    } else {
      ok('Frontend secret scan', 'No service-role patterns found in shipped frontend files');
    }
  } catch (error) {
    fail('Frontend secret scan', String(error?.message || error));
  }

  try {
    const vercelConfig = readJson('vercel.json');
    const globalHeaders = Array.isArray(vercelConfig.headers)
      ? vercelConfig.headers.find((entry) => entry?.source === '/(.*)')
      : null;
    if (!globalHeaders || !Array.isArray(globalHeaders.headers)) {
      fail('Vercel security headers', 'Missing global headers block for /(.*)');
    } else {
      const headerMap = new Map(
        globalHeaders.headers.map((entry) => [String(entry.key || ''), String(entry.value || '')])
      );
      const missing = Object.entries(REQUIRED_HEADERS).filter(
        ([key, value]) => headerMap.get(key) !== value
      );
      if (missing.length) {
        fail(
          'Vercel security headers',
          missing.map(([key, value]) => `${key}=${value}`).join(', ')
        );
      } else {
        ok('Vercel security headers', Object.keys(REQUIRED_HEADERS).join(', '));
      }
    }
  } catch (error) {
    fail('Vercel security headers', String(error?.message || error));
  }

  try {
    const appSource = readText('app.js');
    const indexSource = readText('index.html');
    const hasGateFunction = /function areRuntimeToolsEnabled\(/.test(appSource);
    const hasVisibilityHook = /applyRuntimeToolsVisibility/.test(appSource);
    const hasHiddenTargets = [
      'settings-live-site-config',
      'settings-supabase-config',
      'settings-ads-config',
      'settings-runtime-tools-note',
    ].every((token) => indexSource.includes(token));
    if (hasGateFunction && hasVisibilityHook && hasHiddenTargets) {
      ok('Runtime admin tools gate', 'Advanced runtime settings are not exposed by default on production');
    } else {
      fail('Runtime admin tools gate', 'Missing production gate for runtime/admin settings');
    }
  } catch (error) {
    fail('Runtime admin tools gate', String(error?.message || error));
  }

  try {
    const appSource = readText('app.js');
    if (/await clearLocalRuntimeCaches\(\);/.test(appSource)) {
      ok('Logout cache clearing', 'Sensitive local feed/comment caches are cleared on logout');
    } else {
      fail('Logout cache clearing', 'handleLogout does not clear local runtime caches');
    }
  } catch (error) {
    fail('Logout cache clearing', String(error?.message || error));
  }

  try {
    const gitignore = readText('.gitignore');
    const needed = ['.DS_Store', 'supabase/.DS_Store'];
    const missing = needed.filter((entry) => !gitignore.includes(entry));
    if (missing.length) {
      warn('.gitignore hygiene', `Missing ignore patterns: ${missing.join(', ')}`);
    } else {
      ok('.gitignore hygiene', needed.join(', '));
    }
  } catch (error) {
    warn('.gitignore hygiene', String(error?.message || error));
  }

  console.log('');
  console.log('Manual security checks before go-live');
  console.log('1. Apply all Supabase migrations to production');
  console.log('2. In Supabase Auth, verify redirect URLs and allowed site URL');
  console.log('3. Decide whether email confirmation should stay on before inviting users');
  console.log('4. Review Auth rate limits / bot protection / leaked password protection');
  console.log('5. Confirm public buckets only contain data meant to be public');

  if (hasCriticalIssue) {
    process.exitCode = 1;
  }
}

main();
