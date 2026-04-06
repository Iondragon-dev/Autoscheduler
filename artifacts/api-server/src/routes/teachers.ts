import { Router } from "express";
import { db, teachersTable, timeSlotsTable, bookingsTable } from "@workspace/db";
import { eq, isNull, inArray } from "drizzle-orm";
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
  res.json({
    teacher: { id: teacher.id, name: teacher.name, slug: teacher.slug, subject: teacher.subject },
    slots,
  });
});

router.post("/teachers", async (req, res) => {
  const { name, slug, passcode, subject } = req.body ?? {};
  if (!name?.trim() || !slug?.trim() || !passcode?.trim()) {
    res.status(400).json({ message: "name, slug, and passcode are required." });
    return;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ message: "Slug must only contain lowercase letters, numbers, and hyphens." });
    return;
  }
  const existing = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.slug, slug)).limit(1);
  if (existing.length) {
    res.status(409).json({ message: "That URL name is already taken. Please choose a different one." });
    return;
  }
  const [teacher] = await db
    .insert(teachersTable)
    .values({ name: name.trim(), slug: slug.trim(), passcode: passcode.trim(), subject: subject?.trim() || null })
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
