import { globSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
// Historic baselines and browser fixtures still name files the way they did
// before the move. Resolve current-worktree reads without altering Git refs.
const sources = globSync("src/**/*.{js,css}", {
    cwd: fileURLToPath(root),
    exclude: ["src/i18n/langs/**"],
}).sort();
const paths = new Map(sources.map(path => [basename(path), path.replaceAll("\\", "/")]));
if (paths.size !== sources.length) throw new Error("Duplicate fixture source filename");

export const sourceNames = [...paths.keys()];
export const sourcePath = name => paths.get(name) ?? name;
export const sourceUrl = (path) => new URL(path.startsWith("langs/") ? "src/i18n/" + path : sourcePath(path), root);
