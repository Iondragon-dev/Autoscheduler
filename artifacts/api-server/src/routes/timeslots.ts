import { Router, type IRouter } from "express";
import { db, timeSlotsTable, bookingsTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { CreateBookingBody, CreateTimeSlotBody, UpdateTimeSlotBody } from "@workspace/api-zod";
import { requireTeacherSession } from "./auth";

const router: IRouter = Router();

function serializeSlot(s: typeof timeSlotsTable.$inferSelect) {
  return {
    id: s.id,
    label: s.label,
    startTime: s.startTime,
    endTime: s.endTime,
    available: s.available,
    blockedTimes: s.blockedTimes ?? [],
  };
}

async function getTeacherSlotIds(teacherId: number): Promise<number[]> {
  const slots = await db.select({ id: timeSlotsTable.id }).from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, teacherId));
  return slots.map(s => s.id);
}

async function getTeacherBookings(teacherId: number) {
  const slotIds = await getTeacherSlotIds(teacherId);
  if (slotIds.length === 0) return [];
  return db.select({
    id: bookingsTable.id,
    timeSlotId: bookingsTable.timeSlotId,
    timeSlotLabel: timeSlotsTable.label,
    name: bookingsTable.name,
    email: bookingsTable.email,
    priority1: bookingsTable.priority1,
    priority2: bookingsTable.priority2,
    priority3: bookingsTable.priority3,
    createdAt: bookingsTable.createdAt,
    assignedPriority: bookingsTable.assignedPriority,
    assignedTime: bookingsTable.assignedTime,
  })
  .from(bookingsTable)
  .leftJoin(timeSlotsTable, eq(bookingsTable.timeSlotId, timeSlotsTable.id))
  .where(inArray(bookingsTable.timeSlotId, slotIds))
  .orderBy(bookingsTable.createdAt);
}

// ── Slot routes ────────────────────────────────────────────────────────────────

router.get("/timeslots", requireTeacherSession, async (_req, res) => {
  const slots = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, res.locals.teacherId)).orderBy(timeSlotsTable.id);
  res.json(slots.map(serializeSlot));
});

router.post("/timeslots", requireTeacherSession, async (req, res) => {
  const parsed = CreateTimeSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }
  const { label, startTime, endTime } = parsed.data;
  const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };
  if (toMins(startTime) >= toMins(endTime)) {
    res.status(400).json({ message: "Start time must be before end time." });
    return;
  }
  const [slot] = await db.insert(timeSlotsTable).values({ label, startTime, endTime, available: true, teacherId: res.locals.teacherId }).returning();
  res.status(201).json(serializeSlot(slot));
});

router.patch("/timeslots/:id", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const existing = await db.select().from(timeSlotsTable).where(and(eq(timeSlotsTable.id, id), eq(timeSlotsTable.teacherId, res.locals.teacherId))).limit(1);
  if (!existing.length) { res.status(404).json({ message: "Time slot not found." }); return; }

  const parsed = UpdateTimeSlotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid request body" }); return; }

  const updates: Partial<{ label: string; startTime: string; endTime: string; available: boolean }> = {};
  if (parsed.data.available !== undefined) updates.available = parsed.data.available;
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;

  const toMinsLocal = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };
  const effectiveStart = updates.startTime ?? existing[0].startTime;
  const effectiveEnd = updates.endTime ?? existing[0].endTime;
  if (toMinsLocal(effectiveStart) >= toMinsLocal(effectiveEnd)) {
    res.status(400).json({ message: "Start time must be before end time." });
    return;
  }

  const [updated] = await db.update(timeSlotsTable).set(updates).where(eq(timeSlotsTable.id, id)).returning();
  res.json(serializeSlot(updated));
});

router.patch("/timeslots/:id/blocked-times", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const { ranges } = req.body as { ranges: Array<{ start: string; end: string }> };
  if (!Array.isArray(ranges)) { res.status(400).json({ message: "ranges must be an array" }); return; }

  const existing = await db.select().from(timeSlotsTable).where(and(eq(timeSlotsTable.id, id), eq(timeSlotsTable.teacherId, res.locals.teacherId))).limit(1);
  if (!existing.length) { res.status(404).json({ message: "Time slot not found." }); return; }

  const [updated] = await db.update(timeSlotsTable).set({ blockedTimes: ranges }).where(eq(timeSlotsTable.id, id)).returning();
  res.json(serializeSlot(updated));
});

router.delete("/timeslots/:id", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const existing = await db.select().from(timeSlotsTable).where(and(eq(timeSlotsTable.id, id), eq(timeSlotsTable.teacherId, res.locals.teacherId))).limit(1);
  if (!existing.length) { res.status(404).json({ message: "Time slot not found." }); return; }

  await db.delete(bookingsTable).where(eq(bookingsTable.timeSlotId, id));
  await db.delete(timeSlotsTable).where(eq(timeSlotsTable.id, id));
  res.json({ message: "Deleted successfully" });
});

router.delete("/timeslots", requireTeacherSession, async (_req, res) => {
  const slotIds = await getTeacherSlotIds(res.locals.teacherId);
  if (slotIds.length > 0) {
    await db.delete(bookingsTable).where(inArray(bookingsTable.timeSlotId, slotIds));
    await db.delete(timeSlotsTable).where(eq(timeSlotsTable.teacherId, res.locals.teacherId));
  }
  res.json({ message: "All slots and bookings deleted" });
});

// ── Booking routes ─────────────────────────────────────────────────────────────

router.get("/bookings", requireTeacherSession, async (_req, res) => {
  const bookings = await getTeacherBookings(res.locals.teacherId);
  res.json(bookings.map((b) => ({
    ...b,
    timeSlotLabel: b.timeSlotLabel ?? "Unknown",
    createdAt: b.createdAt?.toISOString() ?? new Date().toISOString(),
  })));
});

router.delete("/bookings", requireTeacherSession, async (_req, res) => {
  const slotIds = await getTeacherSlotIds(res.locals.teacherId);
  if (slotIds.length > 0) {
    await db.delete(bookingsTable).where(inArray(bookingsTable.timeSlotId, slotIds));
  }
  res.json({ message: "All bookings cleared" });
});

router.delete("/bookings/:id", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  const slotIds = await getTeacherSlotIds(res.locals.teacherId);
  const booking = await db.select().from(bookingsTable).where(and(eq(bookingsTable.id, id), slotIds.length > 0 ? inArray(bookingsTable.timeSlotId, slotIds) : eq(bookingsTable.id, -1))).limit(1);
  if (!booking.length) { res.status(404).json({ message: "Booking not found." }); return; }
  await db.delete(bookingsTable).where(eq(bookingsTable.id, id));
  res.json({ ok: true });
});

router.post("/bookings", async (req, res) => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const { timeSlotId, name, email, priority1, priority2, priority3 } = parsed.data;

  const slot = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, timeSlotId)).limit(1);
  if (!slot.length) {
    res.status(400).json({ message: "Time block not found" });
    return;
  }

  const teacherId = slot[0].teacherId;

  // Reject if this email already submitted a booking with the same teacher
  const existingQuery = teacherId != null
    ? db.select({ id: bookingsTable.id }).from(bookingsTable)
        .leftJoin(timeSlotsTable, eq(bookingsTable.timeSlotId, timeSlotsTable.id))
        .where(and(eq(bookingsTable.email, email.toLowerCase().trim()), eq(timeSlotsTable.teacherId, teacherId)))
        .limit(1)
    : db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.email, email.toLowerCase().trim())).limit(1);

  const existing = await existingQuery;
  if (existing.length > 0) {
    res.status(409).json({ message: "A booking request has already been submitted with this email address. Please contact your teacher if you need to make changes." });
    return;
  }

  // Parse and validate all priority strings
  const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  const parsePrio = (p: string): { slotId: number; start: string; end: string } | null => {
    if (!p.includes("|")) return null;
    const [idStr, range] = p.split("|");
    const dashIdx = range.indexOf("-");
    if (dashIdx === -1) return null;
    const start = range.slice(0, dashIdx);
    const end = range.slice(dashIdx + 1);
    const slotId = parseInt(idStr, 10);
    if (isNaN(slotId)) return null;
    return { slotId, start, end };
  };

  const priorities = [priority1, priority2, priority3];
  const parsedPrios = priorities.map(parsePrio);
  if (parsedPrios.some(p => p === null)) {
    res.status(400).json({ message: "Invalid preference format. Please go back and resubmit." });
    return;
  }

  const referencedSlotIds = [...new Set(parsedPrios.map(p => p!.slotId))];
  const referencedSlots = await db.select().from(timeSlotsTable).where(
    referencedSlotIds.length === 1
      ? eq(timeSlotsTable.id, referencedSlotIds[0])
      : inArray(timeSlotsTable.id, referencedSlotIds)
  );
  const slotMap = new Map(referencedSlots.map(s => [s.id, s]));

  for (const prio of parsedPrios) {
    const refSlot = slotMap.get(prio!.slotId);
    if (!refSlot || !refSlot.available) {
      res.status(400).json({ message: "One of your selected time slots no longer exists or is unavailable. Please go back and choose again." });
      return;
    }
    const pStart = toMins(prio!.start);
    const pEnd = toMins(prio!.end);
    const sStart = toMins(refSlot.startTime);
    const sEnd = toMins(refSlot.endTime);
    if (pStart < sStart || pEnd > sEnd || pStart >= pEnd) {
      res.status(400).json({ message: "One of your selected times is outside the allowed range. Please go back and choose again." });
      return;
    }
    const blocked = (refSlot.blockedTimes ?? []);
    const overlapsBlocked = blocked.some(b => toMins(b.start) < pEnd && toMins(b.end) > pStart);
    if (overlapsBlocked) {
      res.status(400).json({ message: "One of your selected times is no longer available. Please go back and choose again." });
      return;
    }
  }

  const slotStartKeys = parsedPrios.map(p => `${p!.slotId}|${p!.start}`);
  const uniqueKeys = new Set(slotStartKeys);
  if (uniqueKeys.size < slotStartKeys.length) {
    res.status(400).json({ message: "Your 3 preferences must each be a different time. Please go back and choose distinct times." });
    return;
  }

  const [booking] = await db.insert(bookingsTable).values({ timeSlotId, name, email: email.toLowerCase().trim(), priority1, priority2, priority3 }).returning();

  res.status(201).json({
    id: booking.id,
    timeSlotId: booking.timeSlotId,
    timeSlotLabel: slot[0].label,
    name: booking.name,
    email: booking.email,
    priority1: booking.priority1,
    priority2: booking.priority2,
    priority3: booking.priority3,
    createdAt: booking.createdAt.toISOString(),
  });
});

// ── Scheduling routes ──────────────────────────────────────────────────────────

router.post("/bookings/auto-schedule", requireTeacherSession, async (req, res) => {
  const apply = req.body?.apply === true;
  const teacherId = res.locals.teacherId;

  const allSlots = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, teacherId));
  const slotIds = allSlots.map(s => s.id);
  const allBookings = slotIds.length > 0
    ? await db.select().from(bookingsTable).where(inArray(bookingsTable.timeSlotId, slotIds)).orderBy(bookingsTable.createdAt)
    : [];

  const schedulerToMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };

  const parsePriority = (p: string | null | undefined) => {
    if (!p || !p.includes("|")) return null;
    const pipeIdx = p.indexOf("|");
    const slotId = parseInt(p.slice(0, pipeIdx));
    if (isNaN(slotId)) return null;
    const range = p.slice(pipeIdx + 1);
    const dashIdx = range.indexOf("-");
    if (dashIdx === -1) return null;
    const startMins = schedulerToMins(range.slice(0, dashIdx));
    const endMins = schedulerToMins(range.slice(dashIdx + 1));
    return { slotId, startMins, endMins, key: p };
  };

  // Track assigned intervals per slot so overlap (not just exact match) is detected
  const assignedBySlot = new Map<number, Array<{ start: number; end: number }>>();
  const overlapsAssigned = (slotId: number, start: number, end: number) =>
    (assignedBySlot.get(slotId) ?? []).some(iv => start < iv.end && end > iv.start);
  const markAssigned = (slotId: number, start: number, end: number) => {
    if (!assignedBySlot.has(slotId)) assignedBySlot.set(slotId, []);
    assignedBySlot.get(slotId)!.push({ start, end });
  };

  // Parse all three priorities for each booking up front
  const bookingParsed = allBookings.map(b => ({
    bookingId: b.id,
    priorities: [b.priority1, b.priority2, b.priority3].map(parsePriority),
  }));

  const assignments = new Map<number, { priority: number; time: string }>();
  const unassigned = new Set(bookingParsed.map(b => b.bookingId));

  // Each iteration: pick the student whose options are most constrained RIGHT NOW
  // (fewest currently-available preferences). This dynamically re-evaluates as slots
  // fill up, so a student whose fallbacks got taken is prioritised over someone who
  // still has many open choices. Ties broken by original submission order.
  while (unassigned.size > 0) {
    let bestEntry: typeof bookingParsed[0] | null = null;
    let bestAvail = Infinity;

    for (const entry of bookingParsed) {
      if (!unassigned.has(entry.bookingId)) continue;
      const avail = entry.priorities.filter(
        p => p !== null &&
             allSlots.some(s => s.id === p!.slotId) &&
             !overlapsAssigned(p!.slotId, p!.startMins, p!.endMins)
      ).length;
      if (avail < bestAvail) { bestAvail = avail; bestEntry = entry; }
    }

    if (!bestEntry) break;
    unassigned.delete(bestEntry.bookingId);
    if (bestAvail === 0) continue; // No available slot for this student

    for (let i = 0; i < bestEntry.priorities.length; i++) {
      const p = bestEntry.priorities[i];
      if (!p) continue;
      if (!allSlots.find(s => s.id === p.slotId)) continue;
      if (overlapsAssigned(p.slotId, p.startMins, p.endMins)) continue;
      assignments.set(bestEntry.bookingId, { priority: i + 1, time: p.key });
      markAssigned(p.slotId, p.startMins, p.endMins);
      break;
    }
  }

  const results = allBookings.map(b => {
    const a = assignments.get(b.id);
    const pipeIdx = a?.time?.indexOf("|") ?? -1;
    const slotId = a && pipeIdx >= 0 ? parseInt(a.time.slice(0, pipeIdx)) : null;
    const timeRange = a && pipeIdx >= 0 ? a.time.slice(pipeIdx + 1) : null;
    const slot = slotId != null ? allSlots.find(s => s.id === slotId) : null;
    return {
      bookingId: b.id,
      name: b.name,
      email: b.email,
      assignedPriority: a?.priority ?? null,
      assignedSlotLabel: slot?.label ?? null,
      assignedTimeRange: timeRange,
      assignedTime: a?.time ?? null,
    };
  });

  if (apply) {
    for (const r of results) {
      await db.update(bookingsTable).set({ assignedPriority: r.assignedPriority, assignedTime: r.assignedTime }).where(eq(bookingsTable.id, r.bookingId));
    }
  }

  const summary = {
    total: results.length,
    got1st: results.filter(r => r.assignedPriority === 1).length,
    got2nd: results.filter(r => r.assignedPriority === 2).length,
    got3rd: results.filter(r => r.assignedPriority === 3).length,
    unassigned: results.filter(r => r.assignedPriority === null).length,
  };

  res.json({ results, summary });
});

router.post("/bookings/apply-schedule", requireTeacherSession, async (req, res) => {
  const { results } = req.body as {
    results: Array<{ bookingId: number; assignedPriority: number | null; assignedTime: string | null }>;
  };
  if (!Array.isArray(results)) {
    res.status(400).json({ message: "results must be an array" });
    return;
  }
  const slotIds = await getTeacherSlotIds(res.locals.teacherId);
  if (slotIds.length === 0) { res.json({ ok: true }); return; }
  for (const r of results) {
    await db.update(bookingsTable)
      .set({ assignedPriority: r.assignedPriority, assignedTime: r.assignedTime })
      .where(and(eq(bookingsTable.id, r.bookingId), inArray(bookingsTable.timeSlotId, slotIds)));
  }
  res.json({ ok: true });
});

router.delete("/bookings/schedule", requireTeacherSession, async (_req, res) => {
  const slotIds = await getTeacherSlotIds(res.locals.teacherId);
  if (slotIds.length > 0) {
    await db.update(bookingsTable).set({ assignedPriority: null, assignedTime: null }).where(inArray(bookingsTable.timeSlotId, slotIds));
  }
  res.json({ ok: true });
});

export default router;
