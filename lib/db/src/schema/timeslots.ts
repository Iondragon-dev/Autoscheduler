import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timeSlotsTable = pgTable("time_slots", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  available: boolean("available").notNull().default(true),
});

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  timeSlotId: integer("time_slot_id").notNull().references(() => timeSlotsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type TimeSlot = typeof timeSlotsTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
