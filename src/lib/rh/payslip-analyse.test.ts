import {
  parseLeaveCountersFromText,
  parseGlowupBulletinHeadersFromText,
} from "./payslip-analyse";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function almost(a: number | null, b: number, eps = 0.001) {
  return a != null && Math.abs(a - b) < eps;
}

{
  const text = `Congés N-1 Congés N
Acquis 25.00 4.17
Pris 9.00
Solde 16.00 4.17
Net payé : 3 194.61 euros`;
  const c = parseLeaveCountersFromText(text);
  assert(almost(c.cpAcquis, 29.17), `cpAcquis ${c.cpAcquis}`);
  assert(almost(c.cpPris, 9), `cpPris ${c.cpPris}`);
  assert(almost(c.cpSolde, 20.17), `cpSolde ${c.cpSolde}`);
  assert(c.rttSolde == null, "no rtt");
}

{
  const text = `Congés N-1 Congés N Jours RTT
Acquis 2.25 2.50 5.93
Pris
Solde 2.25 2.50 5.93 Paiement le 30/06/2025 par Virement`;
  const c = parseLeaveCountersFromText(text);
  assert(almost(c.cpAcquis, 4.75), `cpAcquis ${c.cpAcquis}`);
  assert(c.cpPris == null, "pris vide");
  assert(almost(c.cpSolde, 4.75), `cpSolde ${c.cpSolde}`);
  assert(almost(c.rttAcquis, 5.93), `rttAcquis ${c.rttAcquis}`);
  assert(almost(c.rttSolde, 5.93), `rttSolde ${c.rttSolde}`);
}

{
  // Ne doit pas prendre « Congés payés pris 060726… » pour Pris
  const text = `Congés payés pris 060726-100726 (5 jours) - 5.00
Congés N-1 Congés N
Acquis 25.00 4.17
Pris 9.00
Solde 16.00 4.17`;
  const c = parseLeaveCountersFromText(text);
  assert(almost(c.cpPris, 9), `cpPris not date ${c.cpPris}`);
}

{
  const empty = parseLeaveCountersFromText(`Acquis
Pris
Solde Paiement le 30/11/2025`);
  assert(empty.cpSolde == null && empty.cpAcquis == null, "empty counters");
}

{
  const headers = parseGlowupBulletinHeadersFromText(
    "GLOWUP##BULLETIN##07-2026##00006##TEBOUL##Manon##92103414600024"
  );
  assert(headers.length === 1, "1 header");
  assert(headers[0]!.matricule === "00006", "matricule");
  assert(headers[0]!.periodMonth === 7, "month");
  assert(headers[0]!.periodYear === 2026, "year");
}

console.log("payslip-analyse.test.ts OK");
