import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAll } from "./extract.mjs";

const OLLAMA = "http://localhost:11434";
const MODEL = "nomic-embed-text";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "embeddings.json");

async function embedBatch(texts) {
  // Preferred: /api/embed with input array
  const r = await fetch(`${OLLAMA}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (r.status === 404) return null; // signal fallback
  if (!r.ok) throw new Error(`/api/embed HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.embeddings;
}

async function embedOne(text) {
  const r = await fetch(`${OLLAMA}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: text }),
  });
  if (!r.ok) throw new Error(`/api/embeddings HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.embedding;
}

async function main() {
  const cards = extractAll();
  console.log(`Embedding ${cards.length} questions with ${MODEL}...`);
  const t0 = performance.now();

  const results = [];
  const BATCH = 32;
  let useBatch = true;

  for (let i = 0; i < cards.length; i += BATCH) {
    const slice = cards.slice(i, i + BATCH);
    const texts = slice.map((c) => c.text);
    let vectors = null;
    if (useBatch) {
      vectors = await embedBatch(texts);
      if (vectors === null) {
        console.log("/api/embed 404 -> falling back to /api/embeddings per-text");
        useBatch = false;
      }
    }
    if (!useBatch) {
      vectors = [];
      for (const t of texts) vectors.push(await embedOne(t));
    }
    for (let k = 0; k < slice.length; k++) {
      results.push({ text: slice[k].text, domain: slice[k].domain, vector: vectors[k] });
    }
    process.stdout.write(`\r  embedded ${results.length}/${cards.length}`);
  }

  const t1 = performance.now();
  const totalMs = t1 - t0;
  writeFileSync(OUT, JSON.stringify(results));
  const dim = results[0]?.vector?.length ?? 0;
  console.log(`\nDONE. Embedded ${results.length} questions.`);
  console.log(`Vector dimension: ${dim}`);
  console.log(`Total time: ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`Per-item avg: ${(totalMs / results.length).toFixed(1)}ms`);
  console.log(`Saved -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
