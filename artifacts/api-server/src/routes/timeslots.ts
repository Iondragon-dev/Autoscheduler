import { Router, type IRouter } from "express";
import { db, timeSlotsTable, bookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateBookingBody, CreateTimeSlotBody, UpdateTimeSlotBody } from "@workspace/api-zod";

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

router.post("/timeslots", async (req, res) => {
  const parsed = CreateTimeSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const { label, startTime, endTime } = parsed.data;
  const [slot] = await db.insert(timeSlotsTable).values({ label, startTime, endTime, available: true }).returning();
  res.status(201).json(serializeSlot(slot));
});

router.patch("/timeslots/:id", async (req, res) => {
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

  const [updated] = await db.update(timeSlotsTable).set(updates).where(eq(timeSlotsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ message: "Time slot not found" }); return; }
  res.json(serializeSlot(updated));
});

router.patch("/timeslots/:id/blocked-times", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const { ranges } = req.body as { ranges: Array<{ start: string; end: string }> };
  if (!Array.isArray(ranges)) { res.status(400).json({ message: "ranges must be an array" }); return; }

  const [existing] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ message: "Time slot not found" }); return; }

  const [updated] = await db.update(timeSlotsTable).set({ blockedTimes: ranges }).where(eq(timeSlotsTable.id, id)).returning();
  res.json(serializeSlot(updated));
});

router.delete("/timeslots/:id", async (req, res) => {
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

router.get("/bookings", async (_req, res) => {
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

  const [booking] = await db.insert(bookingsTable).values({ timeSlotId, name, email, priority1, priority2, priority3 }).returning();

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

export default router;
