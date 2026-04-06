import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";

const router = Router();

const PASSCODE_KEY = "teacher_passcode";
const IS_PROD = process.env.NODE_ENV === "production";

if (!process.env.TEACHER_PASSCODE && IS_PROD) {
  console.warn("[auth] WARNING: TEACHER_PASSCODE env var not set. Using default passcode — set TEACHER_PASSCODE or change it via the teacher area before going live.");
}
const DEFAULT_PASSCODE = process.env.TEACHER_PASSCODE ?? "teacher123";

const SESSION_SECRET_FALLBACK = "timeslot-teacher-session-v1";
if (!process.env.SESSION_SECRET && IS_PROD) {
  console.warn("[auth] WARNING: SESSION_SECRET env var not set. Using insecure fallback — set SESSION_SECRET in production.");
}
const SESSION_SECRET = process.env.SESSION_SECRET ?? SESSION_SECRET_FALLBACK;
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: COOKIE_MAX_AGE_MS,
  path: "/",
  secure: IS_PROD,
};

async function getStoredPasscode(): Promise<string> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, PASSCODE_KEY))
    .limit(1);
  return row[0]?.value ?? DEFAULT_PASSCODE;
}

function signPasscode(passcode: string): string {
  return createHmac("sha256", SESSION_SECRET).update(passcode).digest("hex");
}

function verifyCookie(token: string, currentPasscode: string): boolean {
  const expected = signPasscode(currentPasscode);
  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function requireTeacherSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies["teacher_session"] as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Unauthorized. Please log in to the teacher area." });
    return;
  }
  const passcode = await getStoredPasscode();
  if (!verifyCookie(token, passcode)) {
    res.status(401).json({ message: "Session expired. Please log in again." });
    return;
  }
  next();
}

router.post("/auth/teacher", async (req, res) => {
  const { passcode } = req.body ?? {};
  if (typeof passcode !== "string") {
    res.status(400).json({ message: "passcode required" });
    return;
  }
  const expected = await getStoredPasscode();
  if (passcode !== expected) {
    res.status(401).json({ message: "Incorrect passcode." });
    return;
  }
  const token = signPasscode(passcode);
  res.cookie("teacher_session", token, COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.post("/auth/teacher/logout", (_req, res) => {
  res.clearCookie("teacher_session", { path: "/" });
  res.json({ ok: true });
});

router.put("/auth/teacher/passcode", async (req, res) => {
  const token = req.cookies["teacher_session"] as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }
  const expected = await getStoredPasscode();
  if (!verifyCookie(token, expected)) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  const { currentPasscode, newPasscode } = req.body ?? {};
  if (typeof currentPasscode !== "string" || typeof newPasscode !== "string") {
    res.status(400).json({ message: "currentPasscode and newPasscode are required." });
    return;
  }
  if (newPasscode.length < 4) {
    res.status(400).json({ message: "New passcode must be at least 4 characters." });
    return;
  }
  if (currentPasscode !== expected) {
    res.status(401).json({ message: "Current passcode is incorrect." });
    return;
  }

  await db
    .insert(settingsTable)
    .values({ key: PASSCODE_KEY, value: newPasscode })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: newPasscode } });

  const newToken = signPasscode(newPasscode);
  res.cookie("teacher_session", newToken, COOKIE_OPTIONS);
  res.json({ ok: true });
});

export default router;
