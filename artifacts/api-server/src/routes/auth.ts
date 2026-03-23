import { Router } from "express";

const router = Router();

router.post("/auth/teacher", (req, res) => {
  const { passcode } = req.body ?? {};
  const expected = process.env.TEACHER_PASSCODE ?? "teacher123";

  if (typeof passcode !== "string" || passcode !== expected) {
    res.status(401).json({ message: "Incorrect passcode." });
    return;
  }

  res.json({ ok: true });
});

export default router;
