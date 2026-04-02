import { Router, type Request, type Response, type NextFunction } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const PASSCODE_KEY = "teacher_passcode";
const DEFAULT_PASSCODE = process.env.TEACHER_PASSCODE ?? "teacher123";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

const sessions = new Map<string, { createdAt: number }>();

async function getStoredPasscode(): Promise<string> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, PASSCODE_KEY))
    .limit(1);
  return row[0]?.value ?? DEFAULT_PASSCODE;
}

function createSession(): string {
  const token = randomUUID();
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function isValidSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_DURATION_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function requireTeacherSession(req: Request, res: Response, next: NextFunction): void {
  const token = (req as any).cookies?.teacher_session as string | undefined;
  if (!token || !isValidSession(token)) {
    res.status(401).json({ message: "Unauthorized. Please log in to the teacher area." });
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
  const token = createSession();
  res.cookie("teacher_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS,
    path: "/",
  });
  res.json({ ok: true });
});

router.post("/auth/teacher/logout", (req, res) => {
  const token = (req as any).cookies?.teacher_session as string | undefined;
  if (token) sessions.delete(token);
  res.clearCookie("teacher_session", { path: "/" });
  res.json({ ok: true });
});

router.put("/auth/teacher/passcode", async (req, res) => {
  const token = (req as any).cookies?.teacher_session as string | undefined;
  if (!token || !isValidSession(token)) {
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

  const expected = await getStoredPasscode();
  if (currentPasscode !== expected) {
    res.status(401).json({ message: "Current passcode is incorrect." });
    return;
  }

  await db
    .insert(settingsTable)
    .values({ key: PASSCODE_KEY, value: newPasscode })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: newPasscode } });

  res.json({ ok: true });
});

export default router;
