import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireTeacherSession } from "./auth";

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

export default router;
