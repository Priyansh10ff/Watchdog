import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "src");
const missing = [];

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const resolves = (base) =>
  [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")].some(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );

const pattern = /(?:from\s+|import\s+|import\()\s*["'](\.{1,2}\/[^"']+)["']/g;

for (const file of walk(root).filter((f) => /\.(jsx?|mjs)$/.test(f))) {
  const text = fs.readFileSync(file, "utf8");

  for (const match of text.matchAll(pattern)) {
    const target = path.resolve(path.dirname(file), match[1]);

    if (!resolves(target)) {
      missing.push({ file: path.relative(root, file), import: match[1] });
    }
  }
}

if (missing.length === 0) {
  console.log("All imports resolve.");
} else {
  console.log(`${missing.length} import(s) point to files that do not exist:\n`);
  for (const item of missing) console.log(`  src/${item.file.replace(/\\/g, "/")}  ->  ${item.import}`);
  console.log("\nExtract the latest zip into the project root, then run this again.");
  process.exitCode = 1;
}
