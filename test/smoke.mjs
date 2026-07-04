import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "dist", "index.js");

const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

function firstLines(res, n = 6) {
  const txt = res.content?.[0]?.text ?? "";
  return txt.split("\n").slice(0, n).join("\n");
}
function citeCount(res) {
  return res.structuredContent?.citations?.length ?? 0;
}

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  console.log(`\n=== ${name}(${JSON.stringify(args)}) | citations=${citeCount(res)} | isError=${!!res.isError} ===`);
  console.log(firstLines(res));
  return res;
}

await call("eu_search", { query: "personal data breach notification", regulations: ["GDPR"], limit: 2 });
await call("eu_article", { regulation: "GDPR", article_number: "33" });
await call("eu_compare", { query: "incident reporting timeline", regulations: ["DORA", "NIS2", "CRA"] });
await call("eu_check_applicability", { sector: "financial", subsector: "bank" });
await call("eu_evidence", { regulation: "DORA", article: "17" });

// poszerzony zakres (v0.3.0): nowe regulacje digital/data/cyber
await call("eu_search", { query: "very large online platform", regulations: ["DSA"], limit: 2 });
await call("eu_compare", { query: "data access rights", regulations: ["DATA_ACT", "DGA", "GDPR"] });
await call("eu_evidence", { regulation: "DSA", article: "34" });

// negatywne: regulacja poza zakresem (MICA nadal poza 14)
await call("eu_article", { regulation: "MICA", article_number: "1" });
// negatywne: FTS injection-ish
await call("eu_search", { query: "AI Act (high-risk) \"systems\"", limit: 1 });

await client.close();
console.log("\nSMOKE DONE");
