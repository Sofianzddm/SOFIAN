export const HOUR_HEIGHT = 60;
export const TOTAL_HEIGHT = 24 * HOUR_HEIGHT;

export function timeToHours(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h + m / 60;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function computeEventPosition(startTime: string, endTime?: string | null) {
  const start = timeToHours(startTime);
  let end = endTime ? timeToHours(endTime) : start + 1;

  let overflowsNextDay = false;
  if (end <= start) {
    overflowsNextDay = true;
    end = 24;
  }

  const top = start * HOUR_HEIGHT;
  const height = Math.max((end - start) * HOUR_HEIGHT, 28);

  return { top, height, overflowsNextDay };
}

export function layoutEvents<T extends { startTime: string; endTime?: string | null }>(
  events: T[]
): Array<T & { _column: number; _totalColumns: number }> {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    if (startDiff !== 0) return startDiff;
    const aEnd = a.endTime ? timeToMinutes(a.endTime) : timeToMinutes(a.startTime) + 60;
    const bEnd = b.endTime ? timeToMinutes(b.endTime) : timeToMinutes(b.startTime) + 60;
    return bEnd - aEnd;
  });

  const result: Array<T & { _column: number; _totalColumns: number }> = [];
  let currentGroup: typeof sorted = [];
  let groupMaxEnd = 0;

  for (const ev of sorted) {
    const start = timeToMinutes(ev.startTime);
    let end = ev.endTime ? timeToMinutes(ev.endTime) : start + 60;
    if (end <= start) end = 24 * 60;

    if (currentGroup.length > 0 && start >= groupMaxEnd) {
      assignColumns(currentGroup, result);
      currentGroup = [];
      groupMaxEnd = 0;
    }

    currentGroup.push(ev);
    groupMaxEnd = Math.max(groupMaxEnd, end);
  }

  if (currentGroup.length > 0) assignColumns(currentGroup, result);
  return result;
}

function assignColumns<T extends { startTime: string; endTime?: string | null }>(
  group: T[],
  result: Array<T & { _column: number; _totalColumns: number }>
) {
  const columns: number[] = [];
  const assignments: Array<{ ev: T; col: number }> = [];

  for (const ev of group) {
    const start = timeToMinutes(ev.startTime);
    let end = ev.endTime ? timeToMinutes(ev.endTime) : start + 60;
    if (end <= start) end = 24 * 60;

    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] <= start) {
        columns[i] = end;
        assignments.push({ ev, col: i });
        placed = true;
        break;
      }
    }

    if (!placed) {
      columns.push(end);
      assignments.push({ ev, col: columns.length - 1 });
    }
  }

  const totalColumns = columns.length;
  for (const { ev, col } of assignments) {
    result.push({ ...ev, _column: col, _totalColumns: totalColumns });
  }
}
