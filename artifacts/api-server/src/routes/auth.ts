import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { db, teachersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";

declare global {
  namespace Express {
    interface Locals {
      teacherId: number;
      teacherSlug: string;
    }
  }
}

const router = Router();

const IS_PROD = process.env.NODE_ENV === "production";
if (!process.env.SESSION_SECRET) {
  if (IS_PROD) {
    throw new Error("[auth] FATAL: SESSION_SECRET env var must be set in production. Set it to a strong random string (e.g. `openssl rand -hex 32`).");
  }
  console.warn("[auth] WARNING: SESSION_SECRET not set — using insecure dev fallback. Never do this in production.");
}
const SESSION_SECRET = process.env.SESSION_SECRET ?? "timeslot-teacher-session-dev-only";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: COOKIE_MAX_AGE_MS,
  path: "/",
  secure: IS_PROD,
};

function signTeacher(teacherId: number, passcode: string): string {
  return createHmac("sha256", SESSION_SECRET).update(`${teacherId}|${passcode}`).digest("hex");
}

function makeSessionToken(teacherId: number, passcode: string): string {
  return `${teacherId}:${signTeacher(teacherId, passcode)}`;
}

function parseSessionToken(token: string): { teacherId: number; sig: string } | null {
  const colonIdx = token.indexOf(":");
  if (colonIdx === -1) return null;
  const teacherId = parseInt(token.slice(0, colonIdx), 10);
  const sig = token.slice(colonIdx + 1);
  if (isNaN(teacherId) || !sig) return null;
  return { teacherId, sig };
}

export async function requireTeacherSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies["teacher_session"] as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Unauthorized. Please log in to the teacher area." });
    return;
  }
  const parsed = parseSessionToken(token);
  if (!parsed) {
    res.status(401).json({ message: "Session expired. Please log in again." });
    return;
  }
  const rows = await db.select().from(teachersTable).where(eq(teachersTable.id, parsed.teacherId)).limit(1);
  if (!rows.length) {
    res.status(401).json({ message: "Teacher account not found. Please log in again." });
    return;
  }
  const teacher = rows[0];
  const expected = signTeacher(teacher.id, teacher.passcode);
  try {
    const valid = timingSafeEqual(Buffer.from(parsed.sig, "hex"), Buffer.from(expected, "hex"));
    if (!valid) throw new Error();
  } catch {
    res.status(401).json({ message: "Session expired. Please log in again." });
    return;
  }
  res.locals.teacherId = teacher.id;
  res.locals.teacherSlug = teacher.slug;
  next();
}

router.post("/auth/teacher", async (req, res) => {
  const { slug, passcode } = req.body ?? {};
  if (typeof slug !== "string" || typeof passcode !== "string") {
    res.status(400).json({ message: "slug and passcode are required." });
    return;
  }
  const rows = await db.select().from(teachersTable).where(eq(teachersTable.slug, slug.trim())).limit(1);
  if (!rows.length || rows[0].passcode !== passcode) {
    res.status(401).json({ message: "Incorrect teacher name or passcode." });
    return;
  }
  const teacher = rows[0];
  res.cookie("teacher_session", makeSessionToken(teacher.id, teacher.passcode), COOKIE_OPTIONS);
  res.json({ id: teacher.id, name: teacher.name, slug: teacher.slug, subject: teacher.subject });
});

router.post("/auth/teacher/logout", (_req, res) => {
  res.clearCookie("teacher_session", { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/teacher/me", requireTeacherSession, async (req, res) => {
  const rows = await db.select().from(teachersTable).where(eq(teachersTable.id, res.locals.teacherId)).limit(1);
  if (!rows.length) {
    res.status(404).json({ message: "Teacher not found." });
    return;
  }
  const t = rows[0];
  res.json({ id: t.id, name: t.name, slug: t.slug, subject: t.subject });
});

router.put("/auth/teacher/passcode", requireTeacherSession, async (req, res) => {
  const { currentPasscode, newPasscode } = req.body ?? {};
  if (typeof currentPasscode !== "string" || typeof newPasscode !== "string") {
    res.status(400).json({ message: "currentPasscode and newPasscode are required." });
    return;
  }
  if (newPasscode.length < 4) {
    res.status(400).json({ message: "New passcode must be at least 4 characters." });
    return;
  }
  const rows = await db.select().from(teachersTable).where(eq(teachersTable.id, res.locals.teacherId)).limit(1);
  if (!rows.length || rows[0].passcode !== currentPasscode) {
    res.status(401).json({ message: "Current passcode is incorrect." });
    return;
  }
  await db.update(teachersTable).set({ passcode: newPasscode }).where(eq(teachersTable.id, res.locals.teacherId));
  res.cookie("teacher_session", makeSessionToken(res.locals.teacherId, newPasscode), COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.put("/auth/teacher/slug", requireTeacherSession, async (req, res) => {
  const { newSlug, passcode } = req.body ?? {};
  if (typeof newSlug !== "string" || typeof passcode !== "string") {
    res.status(400).json({ message: "newSlug and passcode are required." });
    return;
  }
  const slug = newSlug.trim();
  if (slug.length < 3) {
    res.status(400).json({ message: "Username must be at least 3 characters." });
    return;
  }
  if (!/^[a-zA-Z0-9-]+$/.test(slug)) {
    res.status(400).json({ message: "Username can only contain letters, numbers, and hyphens." });
    return;
  }
  const rows = await db.select().from(teachersTable).where(eq(teachersTable.id, res.locals.teacherId)).limit(1);
  if (!rows.length || rows[0].passcode !== passcode) {
    res.status(401).json({ message: "Incorrect passcode." });
    return;
  }
  if (rows[0].slug === slug) {
    res.status(400).json({ message: "That is already your username." });
    return;
  }
  const existing = await db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.slug, slug)).limit(1);
  if (existing.length) {
    res.status(409).json({ message: "That username is already taken. Please choose a different one." });
    return;
  }
  await db.update(teachersTable).set({ slug, name: slug }).where(eq(teachersTable.id, res.locals.teacherId));
  res.json({ ok: true, slug, name: slug });
});

export default router;
