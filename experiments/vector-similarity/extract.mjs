import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// repo 루트 기준 상대경로 (experiments/vector-similarity/ → ../../)
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NOTES = join(REPO, "notes");

const RE_MAIN = /^\*\*Q\d*(?:\([^)]*\))?\s*[.:]/;
const RE_MAIN_STRIP = /^Q\d*(?:\([^)]*\))?\s*[.:]\s*/;
const RE_TAIL = /^\*\*꼬리/;
const RE_TAIL_STRIP = /^꼬리\s*Q?[\d-]*(?:\([^)]*\))?\s*[.:]\s*/;
const RE_FENCE = /^\s*(```|~~~)/;

function stripQuotes(s) {
  return s.replace(/^["'“”‘’]+/, "").replace(/["'“”‘’]+$/, "").trim();
}

// domain = the top-level notes subfolder name for the file
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function domainOf(file) {
  const rel = file.slice(NOTES.length + 1);
  return rel.split("/")[0];
}

export function extractAll() {
  const files = walk(NOTES);
  const cards = [];
  for (const file of files) {
    const domain = domainOf(file);
    const lines = readFileSync(file, "utf8").split("\n");
    let inFence = false;
    for (const raw of lines) {
      if (RE_FENCE.test(raw)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const t = raw.trim();
      if (!t.endsWith("**")) continue;
      let text = null;
      if (RE_MAIN.test(t)) {
        const inner = t.slice(2, -2).trim();
        text = stripQuotes(inner.replace(RE_MAIN_STRIP, ""));
      } else if (RE_TAIL.test(t)) {
        const inner = t.slice(2, -2).trim();
        text = stripQuotes(inner.replace(RE_TAIL_STRIP, ""));
      }
      if (text) cards.push({ text, domain, sourceFile: file });
    }
  }
  return cards;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cards = extractAll();
  console.log(`TOTAL questions: ${cards.length}`);
  const byDomain = {};
  for (const c of cards) byDomain[c.domain] = (byDomain[c.domain] || 0) + 1;
  console.log("\nPer-domain:");
  for (const d of Object.keys(byDomain).sort()) {
    console.log(`  ${d.padEnd(20)} ${byDomain[d]}`);
  }
  console.log("\nSample (first 10):");
  for (const c of cards.slice(0, 10)) console.log(`  [${c.domain}] ${c.text}`);
}
