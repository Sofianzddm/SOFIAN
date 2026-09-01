export const CP = "#46D6C0";
export const RTT = "#F0C24E";
export const TT = "#7C8CF8";
export const HOL = "#F2C24E";
export const LIME = "#E5F2B5";
export const SICK = "#F2874E";
export const OFF = "#1D2530";

export type CalDay = {
  n: string;
  bg: string;
  fg: string;
  fw: string;
  ring: string;
};

export type MonthGrid = {
  title: string;
  dows: string[];
  days: CalDay[];
};

export function buildMonth(
  year: number,
  month: number,
  title: string,
  marks: Record<number, string>
): MonthGrid {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const days: CalDay[] = [];
  for (let i = 0; i < shift; i++) {
    days.push({ n: "", bg: "transparent", fg: "transparent", fw: "400", ring: "none" });
  }
  for (let d = 1; d <= total; d++) {
    const dow = (shift + d - 1) % 7;
    let bg = "#0E1116";
    let fg = "#B9C2CE";
    let fw = "400";
    let ring = "none";
    if (dow > 4) {
      bg = "#12161C";
      fg = "#4C5563";
    }
    const m = marks[d];
    if (m === "sel" || m === "rtt") {
      bg = RTT;
      fg = "#0A0C0F";
      fw = "700";
    } else if (m === "tt") {
      bg = "rgba(124,140,248,.18)";
      fg = "#A5B0FA";
      fw = "500";
    } else if (m === "hol") {
      bg = "rgba(242,194,78,.2)";
      fg = HOL;
      fw = "700";
    } else if (m === "ferie") {
      bg = "rgba(167,139,250,.18)";
      fg = "#C4B5FD";
      fw = "700";
    } else if (m === "soft") {
      bg = "rgba(70,214,192,.16)";
      fg = CP;
      fw = "500";
    } else if (m === "blocked") {
      bg = "#0E1116";
      fg = "#3A4553";
      fw = "400";
      ring = "inset 0 0 0 1px #1B212A";
    } else if (m === "todaytt") {
      bg = "rgba(124,140,248,.18)";
      fg = "#A5B0FA";
      fw = "700";
      ring = `inset 0 0 0 1.4px ${LIME}`;
    } else if (m === "today") {
      bg = "#0E1116";
      fg = LIME;
      fw = "700";
      ring = `inset 0 0 0 1.4px ${LIME}`;
    }
    days.push({ n: String(d), bg, fg, fw, ring });
  }
  while (days.length % 7 !== 0) {
    days.push({ n: "", bg: "transparent", fg: "transparent", fw: "400", ring: "none" });
  }
  return { title, dows: ["L", "M", "M", "J", "V", "S", "D"], days };
}

export const PEOPLE = [
  { n: "Sofian Ayad-Zeddam", i: "SA", c: "#E5F2B5", r: "Fondateur", d: "Direction générale", ds: "DIRECTION", m: "EMP-0001", bal: "39,5", st: "OK", seen: "il y a 2 min" },
  { n: "Ambre Claude", i: "AC", c: "#F2874E", r: "Account Manager", d: "Business Development", ds: "BUSINESS DEV", m: "EMP-0018", bal: "12,0", st: "OK", seen: "il y a 1 h" },
  { n: "Manon Jullien", i: "MJ", c: "#46D6C0", r: "Partnerships & Casting Manager", d: "Business Development", ds: "BUSINESS DEV", m: "EMP-0021", bal: "8,5", st: "OK", seen: "il y a 3 h" },
  { n: "Leyna Khaled", i: "LK", c: "#7C8CF8", r: "Account Manager", d: "Business Development", ds: "BUSINESS DEV", m: "EMP-0042", bal: "18,0", st: "TÉLÉ", seen: "il y a 12 min" },
  { n: "Inès Lettinger", i: "IL", c: "#F0C24E", r: "Account Manager", d: "Business Development", ds: "BUSINESS DEV", m: "EMP-0030", bal: "4,5", st: "ABSENT", seen: "il y a 3 j" },
  { n: "Janha Messaoudi", i: "JM", c: "#F2874E", r: "Social Media Manager", d: "Social Media", ds: "SOCIAL MEDIA", m: "EMP-0027", bal: "16,0", st: "ABSENT", seen: "il y a 3 j" },
  { n: "Daphnée Bessal", i: "DB", c: "#B48CF0", r: "Talent Manager / Cheffe de projet", d: "Talent Management", ds: "TALENT MGMT", m: "EMP-0009", bal: "21,5", st: "TÉLÉ", seen: "il y a 5 min" },
  { n: "Joey Farrugia", i: "JF", c: "#46D6C0", r: "Talent Manager", d: "Talent Management", ds: "TALENT MGMT", m: "EMP-0012", bal: "14,0", st: "OK", seen: "il y a 25 min" },
  { n: "Anna Jaume", i: "AJ", c: "#5FB8E8", r: "Talent Manager / Cheffe de projet", d: "Talent Management", ds: "TALENT MGMT", m: "EMP-0015", bal: "9,0", st: "OK", seen: "il y a 2 h" },
  { n: "Coralie Loutre", i: "CL", c: "#F06FA8", r: "Talent Manager et Cheffe de projet", d: "Talent Management", ds: "TALENT MGMT", m: "EMP-0011", bal: "11,5", st: "OK", seen: "il y a 40 min" },
  { n: "Alice Marinaro", i: "AM", c: "#B48CF0", r: "Talent Manager", d: "Talent Management", ds: "TALENT MGMT", m: "EMP-0024", bal: "16,5", st: "OK", seen: "il y a 1 h" },
  { n: "Cinssia Soudani", i: "CS", c: "#F2C24E", r: "Talent Manager", d: "Talent Management", ds: "TALENT MGMT", m: "EMP-0019", bal: "3,0", st: "OK", seen: "il y a 4 h" },
  { n: "Manon Teboul", i: "MT", c: "#46D6C0", r: "Talent Manager", d: "Talent Management", ds: "TALENT MGMT", m: "EMP-0007", bal: "7,5", st: "ABSENT", seen: "il y a 3 j" },
  { n: "Maud Arekonamand", i: "MA", c: "#8ED98A", r: "Assistante de direction", d: "Direction générale", ds: "DIRECTION", m: "EMP-0004", bal: "22,0", st: "OK", seen: "il y a 8 min" },
] as const;
