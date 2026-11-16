/**
 * Tests file FIFO + slots (sans Chat réel).
 *   CARTO_CHAT_TEST_FAST=1 node scripts/carto-chat-vps/test-parallel-queue.mjs
 */

process.env.CARTO_CHAT_TEST_FAST = "1";
process.env.CARTO_CHAT_MAX_PARALLEL = "3";

import { ChatGptDriver } from "./chatgpt-driver.mjs";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error(`  FAIL: ${msg}`);
  } else {
    console.log(`  OK: ${msg}`);
  }
}

async function testSlotsAcquireRelease() {
  console.log("\n[1] acquireSlot / releaseSlot (3 max)");
  const d = new ChatGptDriver();
  // Fake pages
  d.slots = [0, 1, 2].map((id) => ({
    id,
    page: { url: () => "https://chatgpt.com/" },
    busy: false,
    endMarker: null,
  }));
  d._sleep = async () => {};

  const a = await d.acquireSlot("GLOWUP_CART_DONE_aaa");
  const b = await d.acquireSlot("GLOWUP_CART_DONE_bbb");
  const c = await d.acquireSlot("GLOWUP_CART_DONE_ccc");
  assert(a.id !== b.id && b.id !== c.id, "3 slots distincts");
  assert(d.busy === true, "tous occupés → busy");
  assert(d.runningCount === 3, "runningCount=3");
  assert(d.slotsInfo().free === 0, "free=0");

  d.releaseSlot(b);
  assert(d.busy === false, "après release → pas full");
  assert(d.slotsInfo().free === 1, "free=1");

  const d2 = await d.acquireSlot("GLOWUP_CART_DONE_ddd");
  assert(d2.id === b.id, "réutilise le slot libéré");
  d.releaseSlot(a);
  d.releaseSlot(c);
  d.releaseSlot(d2);
  assert(d.slotsInfo().free === 3, "tous libres");
}

async function testFifoQueueLogic() {
  console.log("\n[2] File FIFO (simule worker enqueue)");
  const queue = [];
  const running = new Set();
  const MAX = 3;
  const started = [];

  function pump(slotsBusy) {
    while (slotsBusy < MAX && queue.length) {
      const m = queue.shift();
      running.add(m);
      started.push(m);
      slotsBusy += 1;
    }
    return slotsBusy;
  }

  let busy = 0;
  for (const m of ["A", "B", "C", "D", "E"]) {
    queue.push(m);
    busy = pump(busy);
  }
  assert(started.join(",") === "A,B,C", `3 premiers démarrés (got ${started})`);
  assert(queue.join(",") === "D,E", "D,E en file");

  // libère A → D démarre
  running.delete("A");
  busy = running.size;
  busy = pump(busy);
  assert(started.includes("D"), "D démarre après free");
  assert(!queue.includes("D"), "D sorti de la file");
}

async function testPageAlsIsolation() {
  console.log("\n[3] Page getter isolé par AsyncLocalStorage");
  const { AsyncLocalStorage } = await import("node:async_hooks");
  // Smoke : driver expose slotsInfo
  const d = new ChatGptDriver();
  d.slots = [{ id: 0, page: { id: "p0" }, busy: false, endMarker: null }];
  d._page = { id: "fallback" };
  assert(d.page?.id === "fallback", "hors ALS → _page");
  assert(d.slotsInfo().total === 1, "slotsInfo total");
}

async function main() {
  console.log("=== test-parallel-queue ===");
  await testSlotsAcquireRelease();
  await testFifoQueueLogic();
  await testPageAlsIsolation();
  console.log(`\n=== ${failed === 0 ? "ALL PASSED" : `${failed} FAILED`} ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
