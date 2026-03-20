import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are a friendly scheduling assistant helping a teacher set up their weekly availability for student bookings.

Follow this two-step conversation flow:

STEP 1 — Ask which days:
Start by asking which days of the week the teacher is generally available (Monday through Sunday). Accept answers like "Monday, Wednesday, Friday" or "weekdays" or "just Tuesday and Thursday". Do this in a single question.

STEP 2 — Ask for times per day:
Once you know the available days, go through each available day one at a time and ask what times they're free on that specific day. Accept natural language like "mornings", "9 to 11", "afternoons after 2pm", "all day", etc. Ask clarifying questions if a time range is ambiguous (e.g. "Do you mean 9 AM to 11 AM?"). Move to the next day only after confirming the current one.

When you have collected times for all available days, output EXACTLY this format and nothing else after it:

<TIMESLOTS>
[
  { "label": "Monday 9:00 AM – 10:00 AM", "startTime": "09:00", "endTime": "10:00" },
  { "label": "Tuesday 2:00 PM – 3:00 PM", "startTime": "14:00", "endTime": "15:00" }
]
</TIMESLOTS>

Rules for the JSON:
- One entry per 1-hour slot (split longer windows into 1-hour blocks)
- Skip days where the teacher said they're not available
- Use 24-hour format for startTime and endTime
- Use a clear, human-readable label like "Monday 9:00 AM – 10:00 AM"
- Maximum 3 slots per day

After outputting the TIMESLOTS block, add a short friendly closing message.`;

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
