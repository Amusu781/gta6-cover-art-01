// Neon Palms Cover Studio — entrypoint for gta6-cover-art-01 (Node 22, standard
// library only). Copies app/ and screenshots/ from this repository to the
// output directory and writes /output/dossier.json with the kit's
// buildDossier library. Outside the grader's container, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts [--output <dir>]
//
// The output directory is created first when it is missing, and only its
// CONTENTS are cleared, never the directory itself: the grader mounts it on
// a read-only filesystem and runs as an unprivileged user, so removing the
// directory itself fails. The program exits non-zero with a clear message
// when the dossier cannot be built or the gate's caps are exceeded.

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The gate's caps for this bounty (competition.yaml reference/gate.json). */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000
};

/** The dossier itself must fit the gate's 1.5 MiB cap. */
const DOSSIER_MAX_BYTES = 1572864;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`cover art: ${message}\n`);
  process.exit(1);
}

/** Remove every entry of a directory, leaving the directory itself in place. */
function clearContents(dir: string): void {
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

/** Copy one directory tree into another, in sorted order, files only. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from).sort()) {
    const src = join(from, entry);
    const dst = join(to, entry);
    const st = statSync(src);
    if (st.isDirectory()) copyTree(src, dst);
    else if (st.isFile()) copyFileSync(src, dst);
    else fail(`refusing to copy non-regular file ${src}`);
  }
}

const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const appDir = join(here, 'app');
const shotsDir = join(here, 'screenshots');
if (!existsSync(join(appDir, 'index.html'))) fail(`no app/index.html beside main.ts at ${appDir}`);
if (!existsSync(shotsDir)) fail(`no screenshots/ beside main.ts at ${shotsDir}`);
const shotFiles = readdirSync(shotsDir).filter((f) => !f.startsWith('.'));
if (shotFiles.length < 3 || shotFiles.length > 4) {
  fail(`screenshots/ holds ${shotFiles.length} images, the gate wants 3 or 4`);
}

mkdirSync(out, { recursive: true });
clearContents(out);
copyTree(appDir, join(out, 'app'));
copyTree(shotsDir, join(out, 'screenshots'));

let dossier: string;
try {
  dossier = buildDossier(out, CAPS);
} catch (e) {
  fail(`buildDossier refused the entry: ${e instanceof Error ? e.message : String(e)}`);
}
if (Buffer.byteLength(dossier, 'utf8') > DOSSIER_MAX_BYTES) {
  fail(`dossier is ${Buffer.byteLength(dossier, 'utf8')} bytes, over the 1.5 MiB cap`);
}
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`cover art: app/ + ${shotFiles.length} screenshots -> ${out}, dossier ${Buffer.byteLength(dossier, 'utf8')} bytes`);
