/**
 * Génère le littéral TS des 196 groupes + verdict manuel, à coller dans le
 * canvas. Lecture seule. Usage : npx tsx scripts/gen-canvas-data.ts
 */
import fs from "fs";

type V = "SAFE" | "AGENCY" | "DONT" | "BIZ";

// Verdict manuel par numéro de groupe (défaut = AGENCY si absent).
const VERDICT: Record<number, V> = {
  1: "SAFE", 2: "DONT", 3: "DONT", 4: "BIZ", 5: "BIZ", 6: "DONT", 7: "SAFE", 8: "SAFE",
  9: "SAFE", 10: "DONT", 11: "SAFE", 12: "SAFE", 13: "SAFE", 14: "SAFE", 15: "DONT",
  16: "SAFE", 17: "DONT", 18: "SAFE", 19: "SAFE", 20: "SAFE", 21: "SAFE", 22: "SAFE",
  23: "DONT", 24: "DONT", 25: "SAFE", 26: "SAFE", 27: "SAFE", 28: "SAFE", 29: "DONT",
  30: "DONT", 31: "DONT", 32: "SAFE", 33: "SAFE", 34: "SAFE", 35: "SAFE", 36: "SAFE",
  37: "SAFE", 38: "BIZ", 39: "BIZ", 40: "BIZ", 41: "BIZ", 42: "BIZ", 43: "SAFE",
  44: "AGENCY", 45: "BIZ", 46: "AGENCY", 47: "DONT", 48: "BIZ", 49: "BIZ", 50: "DONT",
  51: "DONT", 52: "AGENCY", 53: "BIZ", 54: "BIZ", 55: "BIZ", 56: "DONT", 57: "AGENCY",
  58: "BIZ", 59: "SAFE", 60: "SAFE", 61: "SAFE", 62: "BIZ", 63: "BIZ", 64: "BIZ",
  65: "BIZ", 66: "AGENCY", 67: "SAFE", 68: "AGENCY", 69: "BIZ", 70: "SAFE", 71: "BIZ",
  72: "SAFE", 73: "BIZ", 74: "AGENCY", 75: "BIZ", 76: "DONT", 77: "SAFE", 78: "SAFE",
  79: "AGENCY", 80: "SAFE", 81: "SAFE", 82: "AGENCY", 83: "DONT", 84: "AGENCY",
  85: "SAFE", 86: "DONT", 87: "AGENCY", 88: "BIZ", 89: "AGENCY", 90: "SAFE",
  91: "AGENCY", 92: "BIZ", 93: "DONT", 94: "AGENCY", 95: "AGENCY", 96: "AGENCY",
  97: "SAFE", 98: "AGENCY", 99: "AGENCY", 100: "SAFE", 101: "AGENCY", 102: "AGENCY",
  103: "BIZ", 104: "BIZ", 105: "SAFE", 106: "SAFE", 107: "BIZ", 108: "BIZ", 109: "SAFE",
  110: "SAFE", 111: "SAFE", 112: "SAFE", 113: "SAFE", 114: "SAFE", 115: "DONT",
  116: "SAFE", 117: "BIZ", 118: "SAFE", 119: "SAFE", 120: "AGENCY", 121: "BIZ",
  122: "AGENCY", 123: "BIZ", 124: "SAFE", 125: "SAFE", 126: "BIZ", 127: "BIZ",
  128: "DONT", 129: "SAFE", 130: "SAFE", 131: "BIZ", 132: "BIZ", 133: "BIZ",
  134: "SAFE", 135: "AGENCY", 136: "SAFE", 137: "BIZ", 138: "SAFE", 139: "SAFE",
  140: "SAFE", 141: "AGENCY", 142: "SAFE", 143: "SAFE", 144: "SAFE", 145: "SAFE",
  146: "AGENCY", 147: "BIZ", 148: "BIZ", 149: "AGENCY", 150: "AGENCY", 151: "SAFE",
  152: "SAFE", 153: "BIZ", 154: "SAFE", 155: "BIZ", 156: "AGENCY", 157: "AGENCY",
  158: "AGENCY", 159: "BIZ", 160: "AGENCY", 161: "BIZ", 162: "SAFE", 163: "AGENCY",
  164: "SAFE", 165: "BIZ", 166: "SAFE", 167: "DONT", 168: "SAFE", 169: "SAFE",
  170: "SAFE", 171: "SAFE", 172: "SAFE", 173: "SAFE", 174: "SAFE", 175: "AGENCY",
  176: "AGENCY", 177: "AGENCY", 178: "AGENCY", 179: "SAFE", 180: "SAFE", 181: "SAFE",
  182: "DONT", 183: "SAFE", 184: "BIZ", 185: "SAFE", 186: "AGENCY", 187: "SAFE",
  188: "SAFE", 189: "AGENCY", 190: "SAFE", 191: "AGENCY", 192: "BIZ", 193: "SAFE",
  194: "SAFE", 195: "DONT", 196: "SAFE",
};

type Group = {
  n: number;
  reason: string;
  keep: { nom: string; rel: number };
  sources: { nom: string; rel: number }[];
};

const groups: Group[] = JSON.parse(
  fs.readFileSync("scripts/marque-merge-groups.json", "utf8")
);

const out = groups.map((g) => ({
  n: g.n,
  v: VERDICT[g.n] ?? "AGENCY",
  keep: g.keep.nom,
  kr: g.keep.rel,
  s: g.sources.map((s) => [s.nom, s.rel] as [string, number]),
}));

fs.writeFileSync(
  "scripts/canvas-data.txt",
  "const GROUPS: Group[] = " + JSON.stringify(out) + ";\n",
  "utf8"
);
console.log(`Écrit scripts/canvas-data.txt (${out.length} groupes)`);
