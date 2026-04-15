import { Router } from "express";
import { db, teachersTable, timeSlotsTable, bookingsTable } from "@workspace/db";
import { eq, isNull, inArray, isNotNull } from "drizzle-orm";
import { requireTeacherSession } from "./auth";

const router = Router();

router.get("/teachers", async (_req, res) => {
  const teachers = await db
    .select({ id: teachersTable.id, name: teachersTable.name, slug: teachersTable.slug, subject: teachersTable.subject })
    .from(teachersTable)
    .orderBy(teachersTable.name);
  res.json(teachers);
});

router.get("/teachers/:slug/timeslots", async (req, res) => {
  const { slug } = req.params;
  const rows = await db.select().from(teachersTable).where(eq(teachersTable.slug, slug)).limit(1);
  if (!rows.length) {
    res.status(404).json({ message: "Teacher not found." });
    return;
  }
  const teacher = rows[0];
  const slots = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, teacher.id));

  // Fetch assigned bookings to attach student names to blocked windows
  const slotIds = slots.map(s => s.id);
  const assignedBookings = slotIds.length
    ? await db
        .select({ name: bookingsTable.name, assignedTime: bookingsTable.assignedTime, timeSlotId: bookingsTable.timeSlotId })
        .from(bookingsTable)
        .where(inArray(bookingsTable.timeSlotId, slotIds))
        .then(rows => rows.filter(r => r.assignedTime !== null))
    : [];

  // Map slotId -> [{ start, end, name }]
  // Use the slotId encoded in assignedTime ("slotId|HH:MM-HH:MM") — not timeSlotId —
  // because the auto-scheduler can assign a student to a different slot than the one
  // they originally booked into.
  const namesBySlot = new Map<number, { start: string; end: string; name: string }[]>();
  for (const b of assignedBookings) {
    if (!b.assignedTime) continue;
    const pipeIdx = b.assignedTime.indexOf("|");
    const assignedSlotId = pipeIdx !== -1 ? parseInt(b.assignedTime.slice(0, pipeIdx), 10) : b.timeSlotId;
    if (!assignedSlotId || isNaN(assignedSlotId as number)) continue;
    const range = pipeIdx !== -1 ? b.assignedTime.slice(pipeIdx + 1) : b.assignedTime;
    const dashIdx = range.indexOf("-");
    if (dashIdx === -1) continue;
    const start = range.slice(0, dashIdx);
    const end = range.slice(dashIdx + 1);
    const arr = namesBySlot.get(assignedSlotId) ?? [];
    arr.push({ start, end, name: b.name });
    namesBySlot.set(assignedSlotId, arr);
  }

  res.json({
    teacher: { id: teacher.id, name: teacher.name, slug: teacher.slug, subject: teacher.subject },
    slots: slots.map(s => ({
      ...s,
      bookedSessions: namesBySlot.get(s.id) ?? [],
    })),
  });
});

router.post("/teachers", async (req, res) => {
  const { name, slug, passcode, subject, email } = req.body ?? {};
  if (!name?.trim() || !slug?.trim() || !passcode?.trim()) {
    res.status(400).json({ message: "name, slug, and passcode are required." });
    return;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ message: "Slug must only contain lowercase letters, numbers, and hyphens." });
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ message: "Please enter a valid email address." });
    return;
  }
  const existing = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.slug, slug)).limit(1);
  if (existing.length) {
    res.status(409).json({ message: "That username is already taken. Please choose a different one." });
    return;
  }
  const [teacher] = await db
    .insert(teachersTable)
    .values({ name: name.trim(), slug: slug.trim(), passcode: passcode.trim(), subject: subject?.trim() || null, email: email?.trim() || null })
    .returning();

  await db.update(timeSlotsTable).set({ teacherId: teacher.id }).where(isNull(timeSlotsTable.teacherId));

  res.status(201).json({ id: teacher.id, name: teacher.name, slug: teacher.slug, subject: teacher.subject });
});

router.delete("/teachers/me", requireTeacherSession, async (req, res) => {
  const teacherId = res.locals.teacherId as number;
  const slots = await db
    .select({ id: timeSlotsTable.id })
    .from(timeSlotsTable)
    .where(eq(timeSlotsTable.teacherId, teacherId));
  if (slots.length) {
    const slotIds = slots.map((s) => s.id);
    await db.delete(bookingsTable).where(inArray(bookingsTable.timeSlotId, slotIds));
    await db.delete(timeSlotsTable).where(inArray(timeSlotsTable.id, slotIds));
  }
  await db.delete(teachersTable).where(eq(teachersTable.id, teacherId));
  res.clearCookie("teacher_session", { path: "/" });
  res.json({ ok: true });
});

export default router;
