import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";
import { zipSync } from "fflate";
import inputs from "../../src/spicetify/inputs.json" with { type: "json" };
import { buildLocalDatabaseWorker } from "./build_lrclib_local_runtime.mjs";
import { buildLanguageCatalog } from "./build_language_catalog.mjs";
import { readPcStylesheet } from "./pc_stylesheet.mjs";
import { publishBuildFiles, recoverInterruptedBuild } from "./pc_build_publish.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = join(root, "dist");
const read = (path) => readFile(join(root, path));
const versionPattern = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}$/;
const zipDate = new Date(2000, 0, 1);

const updaterFiles = [
    "updater/README.md",
    "updater/install.sh",
    "updater/install.ps1",
    "updater/uninstall.sh",
    "updater/uninstall.ps1",
    "updater/unix/ivlyrics-updater.applescript",
    "updater/unix/ivlyrics-updater.sh",
    "updater/unix/register-updater-protocol.sh",
    "updater/unix/unregister-updater-protocol.sh",
    "updater/windows/ivlyrics-updater.ps1",
    "updater/windows/register-updater-protocol.ps1",
    "updater/windows/unregister-updater-protocol.ps1",
    "updater/windows/updater-path-utils.ps1",
];

export function releaseVersion(value) {
    if (typeof value !== "string" || !versionPattern.test(value)) {
        throw new Error("Expected a numeric major.minor.patch version");
    }
    return value;
}

async function runtimeFiles(version) {
    const { startup } = inputs;
    const css = readPcStylesheet();
    const startupImports = [
        'import { runExtension } from "./src/spicetify/run-extension.mjs";',
        ...startup.map((path, index) => `import startExtension${index} from ${JSON.stringify("./" + path)};`),
    ];
    const startupCalls = startup.map((path, index) => `runExtension(${JSON.stringify(path)}, startExtension${index});`);
    const worker = await buildLocalDatabaseWorker();
    const virtualSources = {
        "ivlyrics:startup": [...startupImports, ...startupCalls].join("\n"),
        "ivlyrics:lrclib-worker": worker.licenseNotice + "\nexport default " + JSON.stringify(worker.source) + ";\n",
        "ivlyrics:language-catalog": buildLanguageCatalog(),
    };
    const runtimeModules = {
        name: "ivlyrics-runtime-modules",
        setup(builder) {
            builder.onResolve({ filter: /^ivlyrics:/ }, ({ path }) => ({ path, namespace: "ivlyrics" }));
            builder.onResolve({ filter: /^#ivlyrics\/i18n\/languageCatalog\.mjs$/ }, () => ({
                path: "ivlyrics:language-catalog", namespace: "ivlyrics",
            }));
            builder.onLoad({ filter: /.*/, namespace: "ivlyrics" }, ({ path }) => ({
                contents: virtualSources[path], resolveDir: root, loader: "js",
            }));
        },
    };
    const compile = async (entry, extra = {}) => {
        const result = await build({
            absWorkingDir: root,
            entryPoints: ["src/spicetify/" + entry + "-entry.mjs"],
            bundle: true,
            write: false,
            format: "iife",
            platform: "browser",
            target: "esnext",
            charset: "utf8",
            keepNames: true,
            legalComments: "inline",
            define: { IVLYRICS_BUILD_VERSION: JSON.stringify(version) },
            plugins: [runtimeModules],
            ...extra,
        });
        return result.outputFiles[0].contents;
    };
    const [pageBundle, startupBundle] = await Promise.all([
        compile("page", {
            globalName: "__ivLyricsPage",
            footer: { js: "function render() { return __ivLyricsPage.render(); }" },
        }),
        compile("startup"),
    ]);
    return new Map([["index.js", pageBundle], ["startup.js", startupBundle], ["style.css", Buffer.from(css)]]);
}

async function releaseFiles(version) {
    const manifest = JSON.parse(await read("manifest.json"));
    manifest.subfiles = [];
    manifest.subfiles_extension = ["startup.js"];
    const paths = [
        manifest.preview, manifest.readme, "blacklist.json",
        "README.md", "README_EN.md", "docs/assets/preview_readme_en.png", "docs/assets/preview_readme_ko.png",
        "LICENSE", "third_party/lyrics-plus.LGPL-2.1.txt",
        "third_party/TinySegmenter.LICENSE.txt", "third_party/spicetify-visualizer.LICENSE",
        "third_party/preact/LICENSE", ...updaterFiles,
    ];
    const files = new Map(await Promise.all([...new Set(paths)].sort().map(async (path) => {
        if (typeof path !== "string" || !/^[\w./-]+$/.test(path) ||
            path.split("/").some((part) => !part || part === "." || part === "..")) {
            throw new Error("Invalid package path: " + path);
        }
        const bytes = await read(path);
        return [path, /\.(?:json|md|txt|LICENSE|sh|ps1|applescript)$/.test(path) || basename(path) === "LICENSE"
            ? Buffer.from(bytes.toString().replace(/\r\n/g, "\n")) : bytes];
    })));
    files.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
    files.set("version.txt", Buffer.from(version + "\n"));
    for (const [path, bytes] of await runtimeFiles(version)) files.set(path, bytes);
    return files;
}

async function writeBuildFiles(directory, files, zip) {
    const app = join(directory, "ivLyrics");
    const writes = await Promise.allSettled([...files].map(async ([path, bytes]) => {
        const target = join(app, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes, { mode: path.endsWith(".sh") ? 0o755 : 0o644 });
    }));
    const failedWrite = writes.find(write => write.status === "rejected");
    if (failedWrite) throw failedWrite.reason;
    if (zip) {
        const archive = zipSync(Object.fromEntries([...files].map(([path, bytes]) => [
            "ivLyrics/" + path,
            [bytes, { attrs: (path.endsWith(".sh") ? 0o100755 : 0o100644) << 16, os: 3 }],
        ])), { level: 6, mtime: zipDate });
        const zipPath = join(directory, "ivLyrics.zip");
        const hash = createHash("sha256").update(archive).digest("hex");
        await writeFile(zipPath, archive);
        await writeFile(zipPath + ".sha256", hash + "  " + basename(zipPath) + "\n");
    }
}

export async function buildPc({ version, zip = false, directory = output } = {}) {
    version = releaseVersion(version ?? (await read("version.txt")).toString().trim());
    await recoverInterruptedBuild(directory);
    const files = await releaseFiles(version);
    await mkdir(directory, { recursive: true });
    const staging = await mkdtemp(join(directory, ".ivlyrics-build-"));
    try {
        await writeBuildFiles(join(staging, "artifacts"), files, zip);
        await publishBuildFiles(directory, staging, zip);
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
    console.log(`Built ivLyrics ${version}: dist/ivLyrics${zip ? " and dist/ivLyrics.zip" : ""}`);
}

if (import.meta.main ?? (process.argv[1] && import.meta.url === import.meta.resolve(pathToFileURL(process.argv[1]).href))) {
    const { values } = parseArgs({ options: { version: { type: "string" }, zip: { type: "boolean" } } });
    await buildPc(values);
}
