// Local HTTP boundary fixture. Never included in the Worker or used in production.
import { createServer } from "node:http";
import { fixtureExtraction } from "../tests/fixtures/extraction.ts";
import { fixtureTranslation } from "../tests/fixtures/translation.ts";

const responses = new Map<string, unknown>();
const attempts = new Map<string, number>();
createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  const reply = (value: unknown, status = 200) => {
    response.statusCode = status;
    response.end(JSON.stringify(value));
  };
  if (request.url === "/health") return reply({ ok: true });
  if (request.headers.authorization !== "Bearer local-fixture-provider")
    return reply({ error: "Invalid fixture credentials" }, 401);
  if (request.url === "/v1/models/gpt-6.1-terra")
    return reply({ id: "gpt-6.1-terra" });
  if (request.method === "POST" && request.url === "/v1/responses") {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.text?.format?.name === "translated_segments") {
      if (
        body.model !== "gpt-6.1-terra" ||
        body.background !== true ||
        body.store !== false ||
        body.text.format.strict !== true
      )
        return reply({ error: "Incorrect translation protocol" }, 400);
      const input = JSON.parse(body.input[1].content) as {
        segments: { id: string; text: string; context: string }[];
      };
      const key = JSON.stringify(input);
      const attempt = (attempts.get(key) || 0) + 1;
      attempts.set(key, attempt);
      if (key.includes("translation-retry") && attempt <= 4)
        return reply(
          { error: { message: "private translation diagnostic" } },
          403,
        );
      if (key.includes("translation-transient") && attempt === 1)
        return reply({ error: "Temporary translation outage" }, 503);
      const id = `resp_${crypto.randomUUID().replaceAll("-", "")}`;
      responses.set(id, {
        segments: input.segments.map((segment) => ({
          id: segment.id,
          en: segment.text,
          zh: fixtureTranslation(segment.text),
        })),
      });
      return reply({ id, status: "queued" });
    }
    const file = body.input?.[1]?.content?.[0];
    if (
      body.model !== "gpt-6.1-terra" ||
      body.background !== true ||
      body.store !== false ||
      body.text?.format?.strict !== true ||
      file?.detail !== "high" ||
      !file?.file_data?.startsWith("data:application/pdf;base64,")
    )
      return reply({ error: "Incorrect PDF protocol" }, 400);
    const filename = String(file.filename);
    const attempt = (attempts.get(filename) || 0) + 1;
    attempts.set(filename, attempt);
    if (filename.includes("transient") && attempt === 1)
      return reply({ error: "Temporary outage" }, 503);
    if (filename.includes("failure"))
      return reply({ error: { message: "private provider diagnostic" } }, 403);
    const extraction = fixtureExtraction();
    if (filename.includes("contradiction")) {
      extraction.issues = [
        {
          code: "conflicting-source",
          description:
            "Calendar: wear blue. Weekly table: wear red. Both source entries are retained.",
          pages: [1, 2],
        },
      ];
      for (const day of extraction.days)
        day.reminders.push("Weekly table: wear red");
    }
    if (filename.includes("registration"))
      Object.assign(extraction, {
        isLessonPlan: false,
        classId: null,
        documentMonth: null,
        title: "",
        theme: "",
        overview: "",
        days: [],
        weeks: [],
        objectives: [],
        monthlyReminders: [],
      });
    const id = `resp_${crypto.randomUUID().replaceAll("-", "")}`;
    responses.set(id, extraction);
    return reply({ id, status: "queued" });
  }
  const id = request.url?.split("/").pop() || "";
  const extraction = responses.get(id);
  if (extraction)
    return reply({
      id,
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(extraction) }],
        },
      ],
    });
  reply({ error: "Unknown fixture request" }, 404);
}).listen(5199, "127.0.0.1");
