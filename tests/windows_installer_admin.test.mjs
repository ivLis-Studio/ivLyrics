import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// updater/install.ps1 and updater/uninstall.ps1 run on their own (iwr | iex),
// so each carries a copy of the Spicetify administrator handling. These checks
// need no PowerShell; tests/fixtures/windows-installer-upgrade.ps1 runs the
// functions themselves wherever PowerShell is available.

const SCRIPTS = ["updater/install.ps1", "updater/uninstall.ps1"];
const WINDOWS_SCRIPTS = [
  ...SCRIPTS,
  "updater/windows/ivlyrics-updater.ps1",
  "updater/windows/register-updater-protocol.ps1",
  "updater/windows/unregister-updater-protocol.ps1",
  "updater/windows/updater-path-utils.ps1",
];
const BLOCK = /^# --- Spicetify in administrator-only Windows sessions ---\n[\s\S]*?^# --- End of Spicetify administrator handling ---$/m;
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("install.ps1 and uninstall.ps1 carry the same administrator handling", () => {
  const [install, uninstall] = SCRIPTS.map((path) => read(path).match(BLOCK)?.[0]);
  assert.ok(install, "install.ps1 has the administrator block");
  assert.equal(uninstall, install, "uninstall.ps1 has an identical copy of the block");
});

test("--bypass-admin is added only for elevated, unsplit, same-user, non-service sessions", () => {
  const block = read(SCRIPTS[0]).match(BLOCK)[0];
  assert.match(block, /\$Session\.IsAdministrator -and\s+\$Session\.TokenElevationType -eq 1 -and\s+\$Session\.IsSameInteractiveUser -and\s+-not \$Session\.IsServiceAccount/);
  assert.match(block, /return @\(\$Arguments\) \+ "--bypass-admin"/);
});

test("every Spicetify call in the installer and uninstaller goes through the wrapper", () => {
  for (const path of SCRIPTS) {
    const calls = read(path).match(/&\s*spicetify\b[^\n]*/g) || [];
    assert.deepEqual(calls, ["& spicetify @spicetifyArguments 2>&1)"], path);
  }
});

test("the Windows scripts stay ASCII so Windows PowerShell 5.1 reads them unchanged", () => {
  // Without a byte order mark, Windows PowerShell 5.1 decodes a .ps1 file with
  // the system code page.
  for (const path of WINDOWS_SCRIPTS) assert.doesNotMatch(read(path), /[^\x00-\x7F]/, path);
});
