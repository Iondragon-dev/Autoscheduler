import { Router, type IRouter } from "express";
import { db, timeSlotsTable, bookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateBookingBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/timeslots", async (_req, res) => {
  const slots = await db.select().from(timeSlotsTable).orderBy(timeSlotsTable.id);
  res.json(slots.map((s) => ({
    id: s.id,
    label: s.label,
    startTime: s.startTime,
    endTime: s.endTime,
    available: s.available,
  })));
});

router.get("/bookings", async (_req, res) => {
  const bookings = await db.select({
    id: bookingsTable.id,
    timeSlotId: bookingsTable.timeSlotId,
    timeSlotLabel: timeSlotsTable.label,
    name: bookingsTable.name,
    email: bookingsTable.email,
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

  const { timeSlotId, name, email } = parsed.data;

  const slot = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, timeSlotId)).limit(1);
  if (!slot.length) {
    res.status(400).json({ message: "Time slot not found" });
    return;
  }

  const [booking] = await db.insert(bookingsTable).values({ timeSlotId, name, email }).returning();

  res.status(201).json({
    id: booking.id,
    timeSlotId: booking.timeSlotId,
    timeSlotLabel: slot[0].label,
    name: booking.name,
    email: booking.email,
    createdAt: booking.createdAt.toISOString(),
  });
});

export default router;
