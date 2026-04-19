import type { TimeSlot } from "@workspace/api-client-react";
import type { Choice } from "@/types/booking";
import { DURATION_OPTIONS } from "@/lib/booking-constants";

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

export function generateAllStartTimes(
  slotStart: string,
  slotEnd: string,
  durationMins: number,
  blockedTimes: { start: string; end: string }[],
): { time: string; blocked: boolean }[] {
  const winStart = toMins(slotStart);
  const winEnd = toMins(slotEnd);
  const STEP = 15;
  const seen = new Set<string>();
  const times: { time: string; blocked: boolean }[] = [];
  for (let t = winStart; t + durationMins <= winEnd; t += STEP) {
    const tEnd = t + durationMins;
    const blocked = blockedTimes.some(bt => t < toMins(bt.end) && tEnd > toMins(bt.start));
    const s = fromMins(t);
    if (!seen.has(s)) { seen.add(s); times.push({ time: s, blocked }); }
  }
  return times;
}

export function generateStartTimes(
  slotStart: string,
  slotEnd: string,
  durationMins: number,
  blockedTimes: { start: string; end: string }[],
): string[] {
  return generateAllStartTimes(slotStart, slotEnd, durationMins, blockedTimes)
    .filter(t => !t.blocked)
    .map(t => t.time);
}

export function getEffectiveDuration(c: { isCustomDuration: boolean; customDurationStr: string; duration: number | null }): number | null {
  if (c.isCustomDuration) {
    const n = parseInt(c.customDurationStr, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return c.duration;
}

export function isFullyBlocked(startTime: string, endTime: string, blockedTimes: { start: string; end: string }[]): boolean {
  if (!blockedTimes.length) return false;
  const start = toMins(startTime);
  const end = toMins(endTime);
  const sorted = [...blockedTimes].sort((a, b) => toMins(a.start) - toMins(b.start));
  let covered = start;
  for (const bt of sorted) {
    if (toMins(bt.start) > covered) break;
    covered = Math.max(covered, toMins(bt.end));
    if (covered >= end) return true;
  }
  return false;
}

export function validateCustomTime(
  start: string,
  slotStart: string,
  slotEnd: string,
  dur: number,
  blockedTimes: { start: string; end: string }[],
): string | null {
  const startMins = toMins(start);
  const endMins = startMins + dur;
  if (startMins < toMins(slotStart))
    return `Start time must be at or after ${fmt12(slotStart)}.`;
  if (endMins > toMins(slotEnd))
    return `Session would end at ${fmt12(fromMins(endMins))}, after the slot closes at ${fmt12(slotEnd)}.`;
  const isBlocked = blockedTimes.some(bt => startMins < toMins(bt.end) && endMins > toMins(bt.start));
  if (isBlocked)
    return "That time overlaps with a blocked period. Please choose a different time.";
  return null;
}

export function parsePriorityToChoice(priority: string): Choice | null {
  const pipeIdx = priority.indexOf("|");
  if (pipeIdx === -1) return null;
  const slotId = parseInt(priority.slice(0, pipeIdx));
  if (isNaN(slotId)) return null;
  const range = priority.slice(pipeIdx + 1);
  const dashIdx = range.indexOf("-");
  if (dashIdx === -1) return null;
  const start = range.slice(0, dashIdx);
  const end = range.slice(dashIdx + 1);
  const duration = toMins(end) - toMins(start);
  const preset = DURATION_OPTIONS.find(d => d.value === duration);
  return { slotId, duration: preset ? duration : null, isCustomDuration: !preset, customDurationStr: !preset ? String(duration) : "", start, isCustomTime: false, customTimeStr: "" };
}

export function getSubBlocks(slot: TimeSlot, stepMins: number) {
  const start = toMins(slot.startTime);
  const end = toMins(slot.endTime);
  const blocked = (slot.blockedTimes ?? []).map((r) => ({ s: toMins(r.start), e: toMins(r.end) }));

  const blocks: { start: string; end: string; value: string }[] = [];
  for (let t = start; t + stepMins <= end; t += stepMins) {
    const subStart = t;
    const subEnd = t + stepMins;
    const isBlocked = blocked.some((b) => b.s < subEnd && b.e > subStart);
    if (isBlocked) continue;
    const s = fromMins(subStart);
    const e = fromMins(subEnd);
    blocks.push({ start: s, end: e, value: makeValue(slot.id, s, e) });
  }
  return blocks;
}
