import type { TimeSlot } from "@workspace/api-client-react/src/generated/api.schemas";

export function toMins(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMins(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

export function fmt12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Parse and display a stored priority string.
 *  New format: "slotId|HH:MM-HH:MM"
 *  Legacy format: "HH:MM-HH:MM" */
export function fmtPriority(p: string, slots?: { id: number; label: string }[]): string {
  if (!p) return "—";
  if (p.includes("|")) {
    const [idStr, range] = p.split("|");
    const slot = slots?.find((s) => s.id === Number(idStr));
    const [s, e] = range.split("-");
    const dayLabel = slot ? slot.label.split(" ")[0] : "";
    return `${dayLabel ? dayLabel + " · " : ""}${fmt12(s)} – ${fmt12(e)}`;
  }
  if (p.includes("-")) {
    const [s, e] = p.split("-");
    return `${fmt12(s)} – ${fmt12(e)}`;
  }
  return fmt12(p);
}

/** Build "slotId|HH:MM-HH:MM" value string */
export function makeValue(slotId: number, start: string, end: string) {
  return `${slotId}|${start}-${end}`;
}

export function getSubBlocks(slot: TimeSlot, stepMins: number) {
  const start = toMins(slot.startTime);
  const end = toMins(slot.endTime);
  const blocks: { start: string; end: string; value: string }[] = [];
  for (let t = start; t + stepMins <= end; t += stepMins) {
    const s = fromMins(t);
    const e = fromMins(t + stepMins);
    blocks.push({ start: s, end: e, value: makeValue(slot.id, s, e) });
  }
  return blocks;
}
