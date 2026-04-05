import { Router, type IRouter } from "express";
import { db, timeSlotsTable, bookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

router.get("/timeslots", async (_req, res) => {
  const slots = await db.select().from(timeSlotsTable).orderBy(timeSlotsTable.id);
  res.json(slots.map(serializeSlot));
});

router.post("/timeslots", requireTeacherSession, async (req, res) => {
  const parsed = CreateTimeSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const { label, startTime, endTime } = parsed.data;

  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m ?? 0);
  };
  if (toMins(startTime) >= toMins(endTime)) {
    res.status(400).json({ message: "Start time must be before end time." });
    return;
  }

  const [slot] = await db.insert(timeSlotsTable).values({ label, startTime, endTime, available: true }).returning();
  res.status(201).json(serializeSlot(slot));
});

router.patch("/timeslots/:id", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }

  const parsed = UpdateTimeSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const updates: Partial<{ label: string; startTime: string; endTime: string; available: boolean }> = {};
  if (parsed.data.available !== undefined) updates.available = parsed.data.available;
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;

  // Validate start < end when both are present after applying updates
  const toMinsLocal = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };
  const effectiveStart = updates.startTime ?? (await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, id)).limit(1))[0]?.startTime;
  const effectiveEnd = updates.endTime ?? (await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, id)).limit(1))[0]?.endTime;
  if (effectiveStart && effectiveEnd && toMinsLocal(effectiveStart) >= toMinsLocal(effectiveEnd)) {
    res.status(400).json({ message: "Start time must be before end time." });
    return;
  }

  const [updated] = await db.update(timeSlotsTable).set(updates).where(eq(timeSlotsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ message: "Time slot not found" }); return; }
  res.json(serializeSlot(updated));
});

router.patch("/timeslots/:id/blocked-times", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const { ranges } = req.body as { ranges: Array<{ start: string; end: string }> };
  if (!Array.isArray(ranges)) { res.status(400).json({ message: "ranges must be an array" }); return; }

  const [existing] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ message: "Time slot not found" }); return; }

  const [updated] = await db.update(timeSlotsTable).set({ blockedTimes: ranges }).where(eq(timeSlotsTable.id, id)).returning();
  res.json(serializeSlot(updated));
});

router.delete("/bookings", requireTeacherSession, async (_req, res) => {
  await db.delete(bookingsTable);
  res.json({ message: "All bookings cleared" });
});

router.delete("/timeslots", requireTeacherSession, async (_req, res) => {
  await db.delete(bookingsTable);
  await db.delete(timeSlotsTable);
  res.json({ message: "All slots and bookings deleted" });
});

router.delete("/timeslots/:id", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }

  const existing = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, id)).limit(1);
  if (!existing.length) {
    res.status(404).json({ message: "Time slot not found" });
    return;
  }

  await db.delete(bookingsTable).where(eq(bookingsTable.timeSlotId, id));
  await db.delete(timeSlotsTable).where(eq(timeSlotsTable.id, id));
  res.json({ message: "Deleted successfully" });
});

router.get("/bookings", requireTeacherSession, async (_req, res) => {
  const bookings = await db.select({
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
  .orderBy(bookingsTable.createdAt);

  res.json(bookings.map((b) => ({
    ...b,
    timeSlotLabel: b.timeSlotLabel ?? "Unknown",
    createdAt: b.createdAt?.toISOString() ?? new Date().toISOString(),
  })));
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

  // Reject if this email already submitted a booking
  const existing = await db.select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(eq(bookingsTable.email, email.toLowerCase().trim()))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ message: "A booking request has already been submitted with this email address. Please contact your teacher if you need to make changes." });
    return;
  }

  // Reject if any two priorities share the same slot + start time
  const priorities = [priority1, priority2, priority3];
  const slotStartKeys = priorities.map(p => {
    if (!p) return null;
    const pipeIdx = p.indexOf("|");
    const dashIdx = p.indexOf("-", pipeIdx);
    return pipeIdx === -1 ? p : p.slice(0, dashIdx === -1 ? undefined : dashIdx); // "slotId|startTime"
  });
  const uniqueKeys = new Set(slotStartKeys.filter(Boolean));
  if (uniqueKeys.size < slotStartKeys.filter(Boolean).length) {
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

router.post("/bookings/auto-schedule", requireTeacherSession, async (req, res) => {
  const apply = req.body?.apply === true;

  const allBookings = await db.select().from(bookingsTable).orderBy(bookingsTable.createdAt);
  const allSlots = await db.select().from(timeSlotsTable);

  const parsePriority = (p: string | null | undefined) => {
    if (!p || !p.includes("|")) return null;
    const pipeIdx = p.indexOf("|");
    const slotId = parseInt(p.slice(0, pipeIdx));
    if (isNaN(slotId)) return null;
    return { slotId, key: p };
  };

  const assignedPositions = new Set<string>();
  const assignments = new Map<number, { priority: number; time: string }>();

  let unassigned = allBookings.map(b => b.id);

  for (let round = 1; round <= 3; round++) {
    const wants = new Map<string, number[]>();

    for (const bookingId of unassigned) {
      const booking = allBookings.find(b => b.id === bookingId)!;
      const p = round === 1 ? booking.priority1 : round === 2 ? booking.priority2 : booking.priority3;
      const parsed = parsePriority(p);
      if (!parsed) continue;
      if (!allSlots.find(s => s.id === parsed.slotId)) continue;
      if (assignedPositions.has(parsed.key)) continue;
      if (!wants.has(parsed.key)) wants.set(parsed.key, []);
      wants.get(parsed.key)!.push(bookingId);
    }

    const newlyAssigned = new Set<number>();
    for (const [posKey, bookingIds] of wants) {
      const winner = bookingIds[0];
      assignments.set(winner, { priority: round, time: posKey });
      assignedPositions.add(posKey);
      newlyAssigned.add(winner);
    }

    unassigned = unassigned.filter(id => !newlyAssigned.has(id));
    if (unassigned.length === 0) break;
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
      await db.update(bookingsTable)
        .set({ assignedPriority: r.assignedPriority, assignedTime: r.assignedTime })
        .where(eq(bookingsTable.id, r.bookingId));
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

router.delete("/bookings/schedule", requireTeacherSession, async (_req, res) => {
  await db.update(bookingsTable).set({ assignedPriority: null, assignedTime: null });
  res.json({ ok: true });
});

export default router;
