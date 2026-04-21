import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireTeacherSession } from "./auth";
import { db, bookingsTable, timeSlotsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

const CREATE_SYSTEM_PROMPT = `You are a friendly scheduling assistant helping a teacher set up their weekly availability for student bookings.

The teacher will send you a complete availability summary in a single message listing which days they're available and what hours they're free each day.

Your job:
1. Briefly acknowledge their schedule in a warm, one-sentence reply.
2. Immediately output the TIMESLOTS block in EXACTLY this format:

<TIMESLOTS>
[
  { "label": "Monday 9:00 AM – 10:00 AM", "startTime": "09:00", "endTime": "10:00" },
  { "label": "Tuesday 2:00 PM – 3:00 PM", "startTime": "14:00", "endTime": "15:00" }
]
</TIMESLOTS>

Rules for the JSON:
- Create ONE block per day (do NOT split into hourly chunks)
- The block spans the teacher's full available window for that day (e.g., 09:00 to 13:00)
- Use 24-hour format for startTime and endTime
- Use a clear, human-readable label like "Monday 9:00 AM – 1:00 PM"

After the TIMESLOTS block, add one short friendly closing sentence.`;

const BLOCK_SYSTEM_PROMPT = `You are a scheduling assistant helping a teacher block off unavailable time ranges within their existing schedule.

The teacher's current schedule will be provided as JSON context, then the teacher will describe what time ranges to block off.

Your job:
1. Briefly acknowledge what you're blocking in a warm, concise sentence.
2. Output a BLOCK_TIMES block in EXACTLY this format, referencing the slotId values from the provided schedule:

<BLOCK_TIMES>
[
  { "slotId": 3, "ranges": [{ "start": "09:00", "end": "09:30" }] },
  { "slotId": 5, "ranges": [{ "start": "14:00", "end": "14:45" }, { "start": "15:30", "end": "16:00" }] }
]
</BLOCK_TIMES>

Rules:
- Only reference slotIds that exist in the provided schedule
- Use 24-hour HH:MM format for start/end times
- The blocked ranges must fall within the slot's startTime and endTime
- A single slot can have multiple ranges blocked
- If the teacher's request doesn't match any slot, politely say so and output an empty array []

After the BLOCK_TIMES block, add one short friendly closing sentence.`;

async function streamAi(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  res: import("express").Response
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch {
    res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
  }
  res.end();
}

router.post("/ai/schedule", requireTeacherSession, async (req, res) => {
  const { messages } = req.body as { messages: { role: string; content: string }[] };
  if (!Array.isArray(messages)) { res.status(400).json({ message: "messages must be an array" }); return; }
  await streamAi(CREATE_SYSTEM_PROMPT, messages, res);
});

const EDIT_SYSTEM_PROMPT = `You are a scheduling assistant helping a teacher edit their existing weekly schedule.

The teacher's current schedule will be provided as JSON context, then the teacher will describe the changes they want to make.

Your job:
1. Briefly acknowledge the changes in a warm, one-sentence reply.
2. Output an EDIT_SLOTS block in EXACTLY this format:

<EDIT_SLOTS>
[
  { "op": "create", "label": "Thursday 9:00 AM – 11:00 AM", "startTime": "09:00", "endTime": "11:00" },
  { "op": "update", "slotId": 3, "label": "Tuesday 8:00 AM – 12:00 PM", "startTime": "08:00", "endTime": "12:00" },
  { "op": "delete", "slotId": 2 }
]
</EDIT_SLOTS>

Rules for the JSON:
- "op" must be exactly "create", "update", or "delete"
- For "create": include label (human-readable, e.g. "Friday 1:00 PM – 3:00 PM"), startTime, endTime in 24-hour HH:MM
- For "update": include slotId (from the provided schedule) and any of label/startTime/endTime you are changing
- For "delete": include only slotId
- Only reference slotIds that exist in the provided schedule
- Omit operations that aren't needed — output an empty array [] if nothing changes
- Use 24-hour HH:MM format for startTime and endTime

After the EDIT_SLOTS block, add one short friendly closing sentence.`;

router.post("/ai/edit", requireTeacherSession, async (req, res) => {
  const { messages, slots } = req.body as {
    messages: { role: string; content: string }[];
    slots: Array<{ id: number; label: string; startTime: string; endTime: string }>;
  };
  if (!Array.isArray(messages)) { res.status(400).json({ message: "messages must be an array" }); return; }

  const scheduleContext = slots.length
    ? `Current schedule (use these slot IDs for updates/deletes):\n${JSON.stringify(slots.map((s) => ({ slotId: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })), null, 2)}`
    : "No slots are currently set up.";

  const messagesWithContext = [
    { role: "user" as const, content: scheduleContext },
    { role: "assistant" as const, content: "Got it! I can see your current schedule. What changes would you like to make?" },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  await streamAi(EDIT_SYSTEM_PROMPT, messagesWithContext, res);
});

router.post("/ai/block", requireTeacherSession, async (req, res) => {
  const { messages, slots } = req.body as {
    messages: { role: string; content: string }[];
    slots: Array<{ id: number; label: string; startTime: string; endTime: string }>;
  };
  if (!Array.isArray(messages)) { res.status(400).json({ message: "messages must be an array" }); return; }

  const scheduleContext = slots.length
    ? `Current schedule (use these slot IDs):\n${JSON.stringify(slots.map((s) => ({ slotId: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })), null, 2)}`
    : "No slots are currently set up.";

  const messagesWithContext = [
    { role: "user" as const, content: scheduleContext },
    { role: "assistant" as const, content: "Got it! I have your current schedule. What would you like to block off?" },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  await streamAi(BLOCK_SYSTEM_PROMPT, messagesWithContext, res);
});

const AUTO_SCHEDULE_SYSTEM_PROMPT = `You are a scheduling assistant that interprets teacher preferences and converts them into a student priority ordering for an auto-scheduling algorithm.

Scoring system (higher is better):
- 1st choice assigned → +3 points
- 2nd choice assigned → +2 points
- 3rd choice assigned → +1 point
- Unassigned → -6 points
Goal: maximise total score across all students.

How the algorithm works:
- Students submitted 3 ranked time preferences (1st, 2nd, 3rd choice).
- The algorithm processes students in the order you specify.
- When multiple students compete for the same slot, the student listed FIRST in your priority order wins.
- A student left unassigned costs -6 points — far worse than giving them a 3rd choice (+1). Ordering matters most for tie-breaking; the algorithm already tries to minimise unassigned students.
- By default, students who submitted earlier are listed first (first-come, first-served).

Your task:
1. Read the teacher's preferences carefully.
2. In 2-3 sentences, explain how you are interpreting the preferences and what ordering you chose to maximise the score.
3. Output a SCHEDULE_PARAMS block in EXACTLY this format:

<SCHEDULE_PARAMS>
{
  "studentOrder": [3, 1, 2],
  "reasoning": "One-sentence summary of the key adjustment made"
}
</SCHEDULE_PARAMS>

Rules for studentOrder:
- Must be an array containing ALL booking IDs from the input data (no additions, no omissions).
- The student listed first wins any tie conflict for the same slot.
- Interpret preferences creatively: "prioritize [name]" → put that student first; "randomize" → shuffle; "give late submissions a chance" → reverse submission order; "be fair" → already fair by default order.
- If the teacher's preference is vague or doesn't clearly map to an ordering, keep the original submission order.
- Always output valid JSON inside the <SCHEDULE_PARAMS> block.`;

router.post("/ai/auto-schedule", requireTeacherSession, async (req, res) => {
  const { preferences, apply } = req.body as { preferences: string; apply?: boolean };

  if (!preferences?.trim()) {
    res.status(400).json({ message: "preferences is required" });
    return;
  }

  const teacherId = res.locals.teacherId;
  const allSlots = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.teacherId, teacherId));
  const teacherSlotIds = allSlots.map(s => s.id);
  const allBookings = teacherSlotIds.length > 0
    ? await db.select().from(bookingsTable).where(inArray(bookingsTable.timeSlotId, teacherSlotIds)).orderBy(bookingsTable.createdAt)
    : [];

  if (allBookings.length === 0) {
    res.status(400).json({ message: "No student bookings found to schedule." });
    return;
  }

  const bookingContext = allBookings.map((b) => ({
    bookingId: b.id,
    name: b.name,
    submittedAt: b.createdAt,
    choice1: b.priority1,
    choice2: b.priority2,
    choice3: b.priority3,
  }));

  const slotContext = allSlots.map((s) => ({
    slotId: s.id,
    label: s.label,
    startTime: s.startTime,
    endTime: s.endTime,
  }));

  const contextMessage = `Available time slots:\n${JSON.stringify(slotContext, null, 2)}\n\nStudent bookings (${allBookings.length} total, in original submission order):\n${JSON.stringify(bookingContext, null, 2)}\n\nTeacher's scheduling preferences: "${preferences}"`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: AUTO_SCHEDULE_SYSTEM_PROMPT },
        { role: "user", content: contextMessage },
      ],
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Parse SCHEDULE_PARAMS block
    let studentOrder: number[] = allBookings.map((b) => b.id);
    let reasoning = "";

    const paramsMatch = fullText.match(/<SCHEDULE_PARAMS>([\s\S]*?)<\/SCHEDULE_PARAMS>/);
    if (paramsMatch) {
      try {
        const params = JSON.parse(paramsMatch[1].trim()) as { studentOrder?: number[]; reasoning?: string };
        if (Array.isArray(params.studentOrder) && params.studentOrder.length > 0) {
          // Validate — all booking IDs must be present
          const inputIds = new Set(allBookings.map((b) => b.id));
          const validOrder = params.studentOrder.filter((id) => inputIds.has(id));
          const covered = new Set(validOrder);
          // Append any missing IDs in original order
          const missing = allBookings.map((b) => b.id).filter((id) => !covered.has(id));
          studentOrder = [...validOrder, ...missing];
        }
        if (params.reasoning) reasoning = params.reasoning;
      } catch { /* keep defaults */ }
    }

    // Build order map
    const orderMap = new Map(studentOrder.map((id, idx) => [id, idx]));
    const sortedBookings = [...allBookings].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
      return ai - bi;
    });

    // Scoring: 1st=3, 2nd=2, 3rd=1, unassigned=-6
    const PRIORITY_SCORE: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

    // Greedy: constrained-first (fewest distinct days → fewest available → AI order for ties)
    // Includes overlap detection so two students can't get the same time window.
    const toMinsAi = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };
    const parsePriority = (p: string | null | undefined) => {
      if (!p || !p.includes("|")) return null;
      const pipeIdx = p.indexOf("|");
      const slotId = parseInt(p.slice(0, pipeIdx));
      if (isNaN(slotId)) return null;
      const range = p.slice(pipeIdx + 1);
      const dashIdx = range.indexOf("-");
      if (dashIdx === -1) return null;
      const startMins = toMinsAi(range.slice(0, dashIdx));
      const endMins = toMinsAi(range.slice(dashIdx + 1));
      return { slotId, startMins, endMins, key: p };
    };

    const assignedBySlot = new Map<number, Array<{ start: number; end: number }>>();
    const assignedCountBySlot = new Map<number, number>();
    const slotAtCapacity = (slotId: number) => {
      const max = allSlots.find(s => s.id === slotId)?.maxStudents ?? null;
      return max !== null && (assignedCountBySlot.get(slotId) ?? 0) >= max;
    };
    const overlapsAssigned = (slotId: number, start: number, end: number) =>
      slotAtCapacity(slotId) ||
      (assignedBySlot.get(slotId) ?? []).some(iv => start < iv.end && end > iv.start);
    const markAssigned = (slotId: number, start: number, end: number) => {
      if (!assignedBySlot.has(slotId)) assignedBySlot.set(slotId, []);
      assignedBySlot.get(slotId)!.push({ start, end });
      assignedCountBySlot.set(slotId, (assignedCountBySlot.get(slotId) ?? 0) + 1);
    };

    // Parse priorities in AI-determined order (tie-breaking uses this order)
    const bookingParsed = sortedBookings.map(b => ({
      bookingId: b.id,
      priorities: [b.priority1, b.priority2, b.priority3].map(parsePriority),
    }));

    const assignments = new Map<number, { priority: number; time: string }>();
    const unassigned = new Set(bookingParsed.map(b => b.bookingId));

    while (unassigned.size > 0) {
      let bestEntry: typeof bookingParsed[0] | null = null;
      let bestDays = Infinity;
      let bestAvail = Infinity;

      for (const entry of bookingParsed) {
        if (!unassigned.has(entry.bookingId)) continue;
        const availPriorities = entry.priorities.filter(
          p => p !== null &&
               allSlots.some(s => s.id === p!.slotId) &&
               !overlapsAssigned(p!.slotId, p!.startMins, p!.endMins)
        ) as NonNullable<ReturnType<typeof parsePriority>>[];
        const avail = availPriorities.length;
        const days = new Set(availPriorities.map(p => allSlots.find(s => s.id === p.slotId)?.label ?? p.slotId)).size;
        if (days < bestDays || (days === bestDays && avail < bestAvail)) {
          bestDays = days; bestAvail = avail; bestEntry = entry;
        }
      }

      if (!bestEntry) break;
      unassigned.delete(bestEntry.bookingId);
      if (bestAvail === 0) continue;

      for (let i = 0; i < bestEntry.priorities.length; i++) {
        const p = bestEntry.priorities[i];
        if (!p) continue;
        if (!allSlots.find(s => s.id === p.slotId)) continue;
        if (overlapsAssigned(p.slotId, p.startMins, p.endMins)) continue;
        assignments.set(bestEntry.bookingId, { priority: i + 1, time: p.key });
        markAssigned(p.slotId, p.startMins, p.endMins);
        break;
      }
    }

    // Build results
    const results = allBookings.map((b) => {
      const a = assignments.get(b.id);
      const pipeIdx = a?.time?.indexOf("|") ?? -1;
      const slotId = a && pipeIdx >= 0 ? parseInt(a.time.slice(0, pipeIdx)) : null;
      const timeRange = a && pipeIdx >= 0 ? a.time.slice(pipeIdx + 1) : null;
      const slot = slotId != null ? allSlots.find((s) => s.id === slotId) : null;
      const parsedEntry = bookingParsed.find(bp => bp.bookingId === b.id);
      const preferences = (parsedEntry?.priorities ?? []).map((p, i) => {
        if (!p) return null;
        const prefSlot = allSlots.find(s => s.id === p.slotId);
        if (!prefSlot) return null;
        return { priority: i + 1, slotLabel: prefSlot.label, timeRange: p.key.slice(p.key.indexOf("|") + 1), assignedTime: p.key };
      }).filter((p): p is NonNullable<typeof p> => p !== null);
      return {
        bookingId: b.id,
        name: b.name,
        email: b.email,
        assignedPriority: a?.priority ?? null,
        assignedSlotLabel: slot?.label ?? null,
        assignedTimeRange: timeRange,
        assignedTime: a?.time ?? null,
        preferences,
      };
    });

    if (apply) {
      for (const r of results) {
        await db.update(bookingsTable)
          .set({ assignedPriority: r.assignedPriority, assignedTime: r.assignedTime })
          .where(eq(bookingsTable.id, r.bookingId));
      }
    }

    const totalScore = results.reduce((acc, r) => acc + (r.assignedPriority != null ? (PRIORITY_SCORE[r.assignedPriority] ?? 0) : -6), 0);
    const summary = {
      total: results.length,
      got1st: results.filter((r) => r.assignedPriority === 1).length,
      got2nd: results.filter((r) => r.assignedPriority === 2).length,
      got3rd: results.filter((r) => r.assignedPriority === 3).length,
      unassigned: results.filter((r) => r.assignedPriority === null).length,
      totalScore,
    };

    res.write(`data: ${JSON.stringify({ schedule: { results, summary, reasoning } })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch {
    res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
  }

  res.end();
});

export default router;
