export const CANNES_WEEKS = [
  {
    index: 1,
    label: "Semaine 1",
    days: [
      { date: "2026-05-11", inFestival: false },
      { date: "2026-05-12", inFestival: true },
      { date: "2026-05-13", inFestival: true },
      { date: "2026-05-14", inFestival: true },
      { date: "2026-05-15", inFestival: true },
      { date: "2026-05-16", inFestival: true },
      { date: "2026-05-17", inFestival: true },
    ],
  },
  {
    index: 2,
    label: "Semaine 2",
    days: [
      { date: "2026-05-18", inFestival: true },
      { date: "2026-05-19", inFestival: true },
      { date: "2026-05-20", inFestival: true },
      { date: "2026-05-21", inFestival: true },
      { date: "2026-05-22", inFestival: true },
      { date: "2026-05-23", inFestival: true },
      { date: "2026-05-24", inFestival: false },
    ],
  },
] as const;
