import { Router, type IRouter } from "express";
import { db, timeSlotsTable, bookingsTable, teachersTable } from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
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
    hideWhenFull: s.hideWhenFull,
    blockedTimes: s.blockedTimes ?? [],
  };
}

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };
const fromMins = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const fmt12 = (t: string) => { const [hStr, mStr] = t.split(":"); const h = parseInt(hStr, 10); const m = parseInt(mStr, 10); const ap = h < 12 ? "AM" : "PM"; const h12 = h % 12 || 12; return `${h12}:${m.toString().padStart(2, "0")} ${ap}`; };
const dayOfLabel = (lbl: string) => ALL_DAYS.find(d => lbl.startsWith(d)) ?? null;

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
    priority4: bookingsTable.priority4,
    priority5: bookingsTable.priority5,
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
  if (toMins(startTime) >= toMins(endTime)) {
    res.status(400).json({ message: "Start time must be before end time." });
    return;
  }

  const newStart = toMins(startTime);
  const newEnd = toMins(endTime);
  const newDay = dayOfLabel(label);

  // Find existing slots on the same day that overlap with the new slot
  const existing = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, res.locals.teacherId));
  const overlapping = newDay
    ? existing.filter(s => {
        if (dayOfLabel(s.label) !== newDay) return false;
        const sStart = toMins(s.startTime);
        const sEnd = toMins(s.endTime);
        return !(newEnd < sStart || newStart > sEnd);
      })
    : [];

  if (overlapping.length > 0) {
    // Compute the union of all overlapping ranges + the new slot
    const mergedStartMins = Math.min(newStart, ...overlapping.map(s => toMins(s.startTime)));
    const mergedEndMins   = Math.max(newEnd,   ...overlapping.map(s => toMins(s.endTime)));
    const mergedStart = fromMins(mergedStartMins);
    const mergedEnd   = fromMins(mergedEndMins);
    const mergedLabel = `${newDay} ${fmt12(mergedStart)} – ${fmt12(mergedEnd)}`;

    // Keep the first overlapping slot as the primary; delete the rest
    const [primary, ...extras] = overlapping;
    if (extras.length > 0) {
      const extraIds = extras.map(s => s.id);
      await db.update(bookingsTable).set({ timeSlotId: primary.id }).where(inArray(bookingsTable.timeSlotId, extraIds));
      await db.delete(timeSlotsTable).where(inArray(timeSlotsTable.id, extraIds));
    }
    const [merged] = await db.update(timeSlotsTable)
      .set({ label: mergedLabel, startTime: mergedStart, endTime: mergedEnd })
      .where(eq(timeSlotsTable.id, primary.id))
      .returning();
    res.status(201).json(serializeSlot(merged));
    return;
  }

  // No overlap — insert normally
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

  const updates: Partial<{ label: string; startTime: string; endTime: string; available: boolean; hideWhenFull: boolean }> = {};
  if (parsed.data.available !== undefined) updates.available = parsed.data.available;
  if (parsed.data.hideWhenFull !== undefined) updates.hideWhenFull = parsed.data.hideWhenFull;
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "No fields to update." });
    return;
  }

  const effectiveStart = updates.startTime ?? existing[0].startTime;
  const effectiveEnd = updates.endTime ?? existing[0].endTime;
  if (toMins(effectiveStart) >= toMins(effectiveEnd)) {
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

router.delete("/bookings/schedule", requireTeacherSession, async (_req, res) => {
  const slotIds = await getTeacherSlotIds(res.locals.teacherId);
  if (slotIds.length > 0) {
    await db.update(bookingsTable).set({ assignedPriority: null, assignedTime: null, wasScheduled: false }).where(inArray(bookingsTable.timeSlotId, slotIds));
    await syncBlockedTimes(slotIds);
  }
  res.json({ ok: true });
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

// Lookup a student's existing booking by email + teacher slug (no auth required — email is the secret)
router.get("/bookings/lookup", async (req, res) => {
  const email = (req.query.email as string | undefined)?.toLowerCase().trim();
  const slug = req.query.slug as string | undefined;
  if (!email || !slug) { res.status(400).json({ message: "email and slug are required" }); return; }
  const teacherRows = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.slug, slug)).limit(1);
  if (!teacherRows.length) { res.status(404).json({ message: "Teacher not found" }); return; }
  const teacherId = teacherRows[0].id;
  const slotRows = await db.select({ id: timeSlotsTable.id }).from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, teacherId));
  if (!slotRows.length) { res.status(404).json({ message: "No booking found" }); return; }
  const [booking] = await db.select().from(bookingsTable)
    .where(and(eq(bookingsTable.email, email), inArray(bookingsTable.timeSlotId, slotRows.map(s => s.id))))
    .limit(1);
  if (!booking) { res.status(404).json({ message: "No booking found" }); return; }
  res.json(booking);
});

// Update a student's own booking priorities — email used for ownership verification
router.put("/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  const { email, priority1, priority2, priority3, priority4, priority5 } = req.body ?? {};
  if (!email) { res.status(400).json({ message: "email is required" }); return; }
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ message: "Booking not found" }); return; }
  if (existing.email !== email.toLowerCase().trim()) { res.status(403).json({ message: "Email does not match this booking" }); return; }

  // Enforce teacher-configured minimum number of choices
  const slotForTeacher = await db.select({ teacherId: timeSlotsTable.teacherId }).from(timeSlotsTable).where(eq(timeSlotsTable.id, existing.timeSlotId)).limit(1);
  const editTeacherId = slotForTeacher[0]?.teacherId;
  if (editTeacherId != null) {
    const teacherRow = await db.select({ totalPages: teachersTable.totalPages }).from(teachersTable).where(eq(teachersTable.id, editTeacherId)).limit(1);
    if (teacherRow.length > 0) {
      const requiredChoices = Math.round((teacherRow[0].totalPages - 1) / 3);
      const filled = [priority1, priority2, priority3, priority4, priority5].filter((p): p is string => !!p && p.includes("|"));
      if (filled.length < requiredChoices) {
        res.status(400).json({ message: `Please submit ${requiredChoices} ${requiredChoices === 1 ? "preference" : "preferences"} as required by your teacher.` });
        return;
      }
    }
  }

  const [updated] = await db.update(bookingsTable)
    .set({
      priority1,
      priority2: priority2 ?? "",
      priority3: priority3 ?? "",
      priority4: priority4 ?? null,
      priority5: priority5 ?? null,
      assignedPriority: null, assignedTime: null, wasScheduled: false,
    })
    .where(eq(bookingsTable.id, id))
    .returning();
  // Re-run scheduler for all unassigned bookings, with this student processed last
  const slotRow = await db.select({ teacherId: timeSlotsTable.teacherId })
    .from(timeSlotsTable).where(eq(timeSlotsTable.id, existing.timeSlotId)).limit(1);
  if (slotRow[0]?.teacherId) {
    await scheduleUnassigned(slotRow[0].teacherId, id);
  } else {
    await syncBlockedTimes([existing.timeSlotId]);
  }
  res.json(updated);
});

router.post("/bookings", async (req, res) => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const { timeSlotId, name, email, priority1, priority2, priority3, priority4, priority5 } = parsed.data;

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

  const parsePrio = (p: string | undefined): { slotId: number; start: string; end: string } | null => {
    if (!p || !p.includes("|")) return null;
    const [idStr, range] = p.split("|");
    const dashIdx = range.indexOf("-");
    if (dashIdx === -1) return null;
    const start = range.slice(0, dashIdx);
    const end = range.slice(dashIdx + 1);
    const slotId = parseInt(idStr, 10);
    if (isNaN(slotId)) return null;
    return { slotId, start, end };
  };

  // Collect only the non-empty priorities (priority1 is always required)
  const allPriorityStrs = [priority1, priority2, priority3, priority4, priority5];
  const filledPriorityStrs = allPriorityStrs.filter((p): p is string => !!p && p.includes("|"));
  const parsedPrios = filledPriorityStrs.map(parsePrio);
  if (parsedPrios.some(p => p === null)) {
    res.status(400).json({ message: "Invalid preference format. Please go back and resubmit." });
    return;
  }

  // Enforce teacher-configured minimum number of choices
  if (teacherId != null) {
    const teacherRow = await db.select({ totalPages: teachersTable.totalPages }).from(teachersTable).where(eq(teachersTable.id, teacherId)).limit(1);
    if (teacherRow.length > 0) {
      const requiredChoices = Math.round((teacherRow[0].totalPages - 1) / 3);
      if (filledPriorityStrs.length < requiredChoices) {
        res.status(400).json({ message: `Please submit ${requiredChoices} ${requiredChoices === 1 ? "preference" : "preferences"} as required by your teacher.` });
        return;
      }
    }
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
    res.status(400).json({ message: "Your preferences must each be a different time. Please go back and choose distinct times." });
    return;
  }

  const [booking] = await db.insert(bookingsTable).values({
    timeSlotId, name, email: email.toLowerCase().trim(),
    priority1,
    priority2: priority2 ?? "",
    priority3: priority3 ?? "",
    priority4: priority4 ?? null,
    priority5: priority5 ?? null,
  }).returning();

  res.status(201).json({
    id: booking.id,
    timeSlotId: booking.timeSlotId,
    timeSlotLabel: slot[0].label,
    name: booking.name,
    email: booking.email,
    priority1: booking.priority1,
    priority2: booking.priority2,
    priority3: booking.priority3,
    priority4: booking.priority4,
    priority5: booking.priority5,
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

  // Parse all priorities for each booking up front (up to 5)
  const bookingParsed = allBookings.map(b => ({
    bookingId: b.id,
    priorities: [b.priority1, b.priority2, b.priority3, b.priority4, b.priority5].map(parsePriority),
  }));

  const assignments = new Map<number, { priority: number; time: string }>();
  const unassigned = new Set(bookingParsed.map(b => b.bookingId));

  // Each iteration: pick the student whose options are most constrained RIGHT NOW.
  // Primary sort: fewest distinct days among currently-available preferences — a student
  //   locked into one day is most at risk if that day fills up.
  // Tie-break: fewest currently-available preferences overall.
  // Final tie-break: submission order (preserved by iteration order through bookingParsed).
  while (unassigned.size > 0) {
    let bestEntry: typeof bookingParsed[0] | null = null;
    let bestAvail = Infinity;
    let bestDays = Infinity;

    for (const entry of bookingParsed) {
      if (!unassigned.has(entry.bookingId)) continue;
      const availPriorities = entry.priorities.filter(
        p => p !== null &&
             allSlots.some(s => s.id === p!.slotId) &&
             !overlapsAssigned(p!.slotId, p!.startMins, p!.endMins)
      ) as NonNullable<ReturnType<typeof parsePriority>>[];
      const avail = availPriorities.length;
      const days = new Set(availPriorities.map(p => allSlots.find(s => s.id === p.slotId)?.label ?? p.slotId)).size;
      if (days < bestDays || (days === bestDays && avail < bestAvail)) {
        bestAvail = avail; bestDays = days; bestEntry = entry;
      }
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
    const parsedEntry = bookingParsed.find(bp => bp.bookingId === b.id);
    const preferences = (parsedEntry?.priorities ?? []).map((p, i) => {
      if (!p) return null;
      const prefSlot = allSlots.find(s => s.id === p.slotId);
      if (!prefSlot) return null;
      return {
        priority: i + 1,
        slotLabel: prefSlot.label,
        timeRange: p.key.slice(p.key.indexOf("|") + 1),
        assignedTime: p.key,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);
    return {
      bookingId: b.id,
      name: b.name,
      email: b.email,
      assignedPriority: a?.priority ?? null,
      assignedSlotLabel: slot?.label ?? null,
      assignedTimeRange: timeRange,
      assignedTime: a?.time ?? null,
      preferences,
    };
  });

  if (apply) {
    for (const r of results) {
      await db.update(bookingsTable)
        .set({ assignedPriority: r.assignedPriority, assignedTime: r.assignedTime, wasScheduled: true })
        .where(eq(bookingsTable.id, r.bookingId));
    }
  }

  const PRIORITY_SCORE: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
  const totalScore = results.reduce((acc, r) => acc + (r.assignedPriority != null ? (PRIORITY_SCORE[r.assignedPriority] ?? 0) : -6), 0);
  const summary = {
    total: results.length,
    got1st: results.filter(r => r.assignedPriority === 1).length,
    got2nd: results.filter(r => r.assignedPriority === 2).length,
    got3rd: results.filter(r => r.assignedPriority === 3).length,
    unassigned: results.filter(r => r.assignedPriority === null).length,
    totalScore,
  };

  res.json({ results, summary });
});

// Recompute blockedTimes for a set of slot IDs based on their currently assigned bookings.
// assignedTime is "assignedSlotId|HH:MM-HH:MM" — the slotId prefix identifies the actual
// assigned slot, which may differ from the booking's original timeSlotId.
async function syncBlockedTimes(slotIds: number[]) {
  if (slotIds.length === 0) return;

  // Fetch all assigned bookings for these slots (by original timeSlotId)
  const assigned = await db.select({ assignedTime: bookingsTable.assignedTime })
    .from(bookingsTable)
    .where(and(inArray(bookingsTable.timeSlotId, slotIds), isNotNull(bookingsTable.assignedTime)));

  // Group blocked intervals by the slot ID encoded in assignedTime, not by timeSlotId
  const grouped = new Map<number, Array<{ start: string; end: string }>>();
  for (const sid of slotIds) grouped.set(sid, []); // ensure every affected slot is cleared
  for (const b of assigned) {
    if (!b.assignedTime) continue;
    const pipeIdx = b.assignedTime.indexOf("|");
    if (pipeIdx === -1) continue;
    const assignedSlotId = parseInt(b.assignedTime.slice(0, pipeIdx), 10);
    if (isNaN(assignedSlotId)) continue;
    const range = b.assignedTime.slice(pipeIdx + 1);
    const dashIdx = range.indexOf("-");
    if (dashIdx === -1) continue;
    const entry = grouped.get(assignedSlotId) ?? [];
    entry.push({ start: range.slice(0, dashIdx), end: range.slice(dashIdx + 1) });
    grouped.set(assignedSlotId, entry);
  }

  for (const [slotId, blocked] of grouped) {
    await db.update(timeSlotsTable)
      .set({ blockedTimes: blocked.length > 0 ? blocked : null })
      .where(eq(timeSlotsTable.id, slotId));
  }
}

// Run the scheduler over all currently unassigned bookings for a teacher,
// forcing `lastBookingId` to be processed last (lowest priority).
async function scheduleUnassigned(teacherId: number, lastBookingId: number) {
  const allSlots = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, teacherId));
  const slotIds = allSlots.map(s => s.id);
  if (slotIds.length === 0) return;

  const allBookings = await db.select().from(bookingsTable)
    .where(inArray(bookingsTable.timeSlotId, slotIds))
    .orderBy(bookingsTable.createdAt);

  const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };
  const parsePri = (p: string | null | undefined) => {
    if (!p || !p.includes("|")) return null;
    const pi = p.indexOf("|");
    const slotId = parseInt(p.slice(0, pi));
    if (isNaN(slotId)) return null;
    const range = p.slice(pi + 1);
    const di = range.indexOf("-");
    if (di === -1) return null;
    return { slotId, startMins: toMins(range.slice(0, di)), endMins: toMins(range.slice(di + 1)), key: p };
  };

  // Pre-populate already-assigned intervals so we don't double-book
  const assignedBySlot = new Map<number, Array<{ start: number; end: number }>>();
  const overlaps = (slotId: number, s: number, e: number) =>
    (assignedBySlot.get(slotId) ?? []).some(iv => s < iv.end && e > iv.start);
  const mark = (slotId: number, s: number, e: number) => {
    if (!assignedBySlot.has(slotId)) assignedBySlot.set(slotId, []);
    assignedBySlot.get(slotId)!.push({ start: s, end: e });
  };

  for (const b of allBookings) {
    if (!b.assignedTime) continue;
    const p = parsePri(b.assignedTime);
    if (p) mark(p.slotId, p.startMins, p.endMins);
  }

  // Schedule unassigned bookings, excluding the editing student (they stay unassigned until
  // the teacher manually re-runs the scheduler, giving other waiting students the freed slot)
  const pending = allBookings
    .filter(b => b.assignedTime === null && b.id !== lastBookingId)
    .map(b => ({
      bookingId: b.id,
      timeSlotId: b.timeSlotId,
      priorities: [b.priority1, b.priority2, b.priority3, b.priority4, b.priority5].map(parsePri),
    }));

  const assignments = new Map<number, { priority: number; time: string }>();
  const unassigned = new Set(pending.map(b => b.bookingId));

  while (unassigned.size > 0) {
    let best: typeof pending[0] | null = null;
    let bestAvail = Infinity;
    let bestDays = Infinity;

    for (const entry of pending) {
      if (!unassigned.has(entry.bookingId)) continue;

      const avail = entry.priorities.filter(
        p => p && allSlots.some(s => s.id === p.slotId) && !overlaps(p.slotId, p.startMins, p.endMins)
      );
      const days = new Set(avail.map(p => allSlots.find(s => s.id === p!.slotId)?.label ?? p!.slotId)).size;
      const n = avail.length;
      if (days < bestDays || (days === bestDays && n < bestAvail)) {
        bestAvail = n; bestDays = days; best = entry;
      }
    }

    if (!best) break;
    unassigned.delete(best.bookingId);
    if (bestAvail === 0) continue;

    for (const p of best.priorities) {
      if (!p || !allSlots.find(s => s.id === p.slotId) || overlaps(p.slotId, p.startMins, p.endMins)) continue;
      assignments.set(best.bookingId, { priority: best.priorities.indexOf(p) + 1, time: p.key });
      mark(p.slotId, p.startMins, p.endMins);
      break;
    }
  }

  // Persist new assignments
  const affectedSlots = new Set<number>();
  for (const b of pending) {
    const a = assignments.get(b.bookingId);
    await db.update(bookingsTable)
      .set({ assignedPriority: a?.priority ?? null, assignedTime: a?.time ?? null })
      .where(eq(bookingsTable.id, b.bookingId));
    affectedSlots.add(b.timeSlotId);
  }
  if (affectedSlots.size > 0) await syncBlockedTimes([...affectedSlots]);
}

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
      .set({ assignedPriority: r.assignedPriority, assignedTime: r.assignedTime, wasScheduled: true })
      .where(and(eq(bookingsTable.id, r.bookingId), inArray(bookingsTable.timeSlotId, slotIds)));
  }
  await syncBlockedTimes(slotIds);
  res.json({ ok: true });
});

router.patch("/bookings/:id/assignment", requireTeacherSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  const slotIds = await getTeacherSlotIds(res.locals.teacherId);
  if (slotIds.length === 0) { res.status(404).json({ message: "Booking not found." }); return; }
  const [booking] = await db.select().from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), inArray(bookingsTable.timeSlotId, slotIds)))
    .limit(1);
  if (!booking) { res.status(404).json({ message: "Booking not found." }); return; }
  const { assignedTime, assignedPriority } = req.body as { assignedTime: string | null; assignedPriority: number | null };
  await db.update(bookingsTable)
    .set({ assignedTime: assignedTime ?? null, assignedPriority: assignedPriority ?? null })
    .where(eq(bookingsTable.id, id));
  await syncBlockedTimes(slotIds);
  res.json({ ok: true });
});

export default router;
