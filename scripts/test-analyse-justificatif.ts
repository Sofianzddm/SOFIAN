/** Test manuel de l'analyse IA d'un justificatif : npx tsx -r dotenv/config scripts/test-analyse-justificatif.ts <fichier> */
import { readFileSync } from "fs";
import { analyzeJustificatif } from "../src/lib/depenses-analyse";

async function main() {
  const path = process.argv[2] ?? "public/logo-glowup.png";
  const buffer = readFileSync(path);
  const type = path.endsWith(".pdf")
    ? "application/pdf"
    : path.endsWith(".png")
      ? "image/png"
      : "image/jpeg";
  console.log(`Analyse de ${path} (${type})…`);
  const result = await analyzeJustificatif(buffer, type);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
