import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const PASSCODE_KEY = "teacher_passcode";
const DEFAULT_PASSCODE = process.env.TEACHER_PASSCODE ?? "teacher123";

async function getStoredPasscode(): Promise<string> {
  const row = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, PASSCODE_KEY))
    .limit(1);
  return row[0]?.value ?? DEFAULT_PASSCODE;
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
  res.json({ ok: true });
});

router.put("/auth/teacher/passcode", async (req, res) => {
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

router.post("/auth/teacher/passcode/reset", async (_req, res) => {
  await db
    .insert(settingsTable)
    .values({ key: PASSCODE_KEY, value: DEFAULT_PASSCODE })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: DEFAULT_PASSCODE } });
  res.json({ ok: true, defaultPasscode: DEFAULT_PASSCODE });
});

export default router;
