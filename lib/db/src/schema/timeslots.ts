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
  hideFullyBlocked: boolean("hide_fully_blocked").notNull().default(true),
  blockFromAppointments: boolean("block_from_appointments").notNull().default(true),
  durationOptions: json("duration_options").$type<Array<{ label: string; value: number }>>(),
  totalPages: integer("total_pages").notNull().default(10),
  minStudentsPerSlot: integer("min_students_per_slot").default(1),
  maxStudentsPerSlot: integer("max_students_per_slot").default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const timeSlotsTable = pgTable("time_slots", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachersTable.id),
  label: text("label").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  available: boolean("available").notNull().default(true),
  hideWhenFull: boolean("hide_when_full").notNull().default(true),
  blockedTimes: json("blocked_times").$type<Array<{ start: string; end: string }>>(),
  maxStudents: integer("max_students").default(1),
});

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  timeSlotId: integer("time_slot_id").notNull().references(() => timeSlotsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  priority1: text("priority1").notNull(),
  priority2: text("priority2").notNull().default(""),
  priority3: text("priority3").notNull().default(""),
  priority4: text("priority4"),
  priority5: text("priority5"),
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
