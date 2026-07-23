import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, "embeddings.json"), "utf8"));

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function cosine(a, b) { return dot(a, b) / (norm(a) * norm(b)); }

// Pre-compute norms
for (const d of data) d._norm = norm(d.vector);

function cosFast(a, an, b, bn) { return dot(a, b) / (an * bn); }

// Find an item whose text includes a substring (case-insensitive), across a given domain if provided
function pick(sub, domain) {
  const hit = data.find(
    (d) => d.text.includes(sub) && (!domain || d.domain === domain)
  );
  if (!hit) throw new Error(`query not found: ${sub}`);
  return hit;
}

// 5 hand-picked queries spanning different domains
const queries = [
  pick("프로세스", "02-os"),
  pick("TCP", "03-network"),
  pick("인덱스는 왜 빠르고", "04-database"),
  pick("HashMap", "01-java-jvm"),
  pick("GC가 어떤 객체", "01-java-jvm"),
];

for (const q of queries) {
  const scored = [];
  for (const d of data) {
    if (d === q) continue;
    scored.push({ score: cosFast(q.vector, q._norm, d.vector, d._norm), text: d.text, domain: d.domain });
  }
  scored.sort((a, b) => b.score - a.score);
  console.log("=".repeat(80));
  console.log(`QUERY [${q.domain}]: ${q.text}`);
  console.log("-".repeat(80));
  for (const h of scored.slice(0, 5)) {
    console.log(`  ${h.score.toFixed(3)}  [${h.domain}]  ${h.text}`);
  }
  console.log("");
}
