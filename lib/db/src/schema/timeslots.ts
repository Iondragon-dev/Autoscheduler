import { pgTable, serial, text, boolean, timestamp, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teachersTable = pgTable("teachers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  passcode: text("passcode").notNull(),
  subject: text("subject"),
  email: text("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const timeSlotsTable = pgTable("time_slots", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachersTable.id),
  label: text("label").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  available: boolean("available").notNull().default(true),
  blockedTimes: json("blocked_times").$type<Array<{ start: string; end: string }>>(),
});

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  timeSlotId: integer("time_slot_id").notNull().references(() => timeSlotsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  priority1: text("priority1").notNull(),
  priority2: text("priority2").notNull(),
  priority3: text("priority3").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  assignedPriority: integer("assigned_priority"),
  assignedTime: text("assigned_time"),
  wasScheduled: boolean("was_scheduled").notNull().default(false),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type TimeSlot = typeof timeSlotsTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type Teacher = typeof teachersTable.$inferSelect;
