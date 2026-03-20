import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are a friendly scheduling assistant helping a teacher set up their weekly availability for student bookings.

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

router.post("/ai/schedule", async (req, res) => {
  const { messages } = req.body as { messages: { role: string; content: string }[] };

  if (!Array.isArray(messages)) {
    res.status(400).json({ message: "messages must be an array" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
  }

  res.end();
});

export default router;
