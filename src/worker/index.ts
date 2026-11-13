import { isClassId } from "../shared/classes";
import { parseMailConfig } from "../shared/mail-config";
import { isAdmin } from "./auth";
import { HttpError, MAX_EMAIL_BYTES, readLimited } from "./errors";
import { ingestMail } from "./mail";
import { highlights, listPlans, savePlan } from "./plans";
import { detail, listMail, stats } from "./queries";

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/site")
    return Response.json({
      inboundAddress: parseMailConfig(env.MAIL_CONFIG).inboundAddress,
    });
  if (path === "/api/health") return Response.json({ status: "ok" });
  if (path === "/api/import" && request.method === "POST") {
    if (!(await isAdmin(request, env)))
      throw new HttpError(401, "Import credentials required.");
    const selected = url.searchParams.get("class");
    if (selected && !isClassId(selected))
      throw new HttpError(400, "Unknown classroom.");
    const raw = await readLimited(request.body, MAX_EMAIL_BYTES);
    const messages = await ingestMail(
      env,
      raw,
      "",
      selected && isClassId(selected) ? [selected] : [],
    );
    return Response.json(messages.length === 1 ? messages[0] : { messages }, {
      status: 201,
    });
  }
  if (path === "/api/plans" && request.method === "POST") {
    if (!(await isAdmin(request, env)))
      throw new HttpError(401, "Import credentials required.");
    const bytes = await readLimited(request.body, 256 * 1024);
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new HttpError(400, "Invalid JSON.");
    }
    return Response.json(await savePlan(env.DB, input), { status: 201 });
  }
  if (request.method !== "GET" && request.method !== "HEAD")
    throw new HttpError(405, "Method not allowed.");
  if (path === "/api/plans") return Response.json(await listPlans(env.DB, url));
  if (path === "/api/highlights")
    return Response.json(await highlights(env.DB, url));
  if (path === "/api/mail") return Response.json(await listMail(env.DB, url));
  if (path === "/api/stats") return Response.json(await stats(env.DB));
  const mailMatch = path.match(/^\/api\/mail\/([a-f0-9]{64})$/);
  if (mailMatch?.[1]) return Response.json(await detail(env.DB, mailMatch[1]));
  const download = path.match(
    /^\/api\/(attachments|original)\/([a-f0-9]{64})$/,
  );
  if (download?.[2]) {
    const attachment = download[1] === "attachments";
    const row = await env.DB.prepare(
      attachment
        ? "SELECT object_key,filename,content_type FROM attachments WHERE id=?"
        : "SELECT raw_key object_key,'original.eml' filename,'message/rfc822' content_type FROM messages WHERE id=?",
    )
      .bind(download[2])
      .first<{ object_key: string; filename: string; content_type: string }>();
    if (!row) throw new HttpError(404, "File not found.");
    const object = await env.MAIL_BUCKET.get(row.object_key);
    if (!object)
      throw new HttpError(404, "File is unavailable. Please try again later.");
    const safePreview =
      url.searchParams.get("preview") === "1" &&
      [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "text/plain",
      ].includes(row.content_type);
    return new Response(object.body, {
      headers: {
        "Content-Type": safePreview
          ? row.content_type
          : "application/octet-stream",
        "Content-Disposition": `${safePreview ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/'/g, "%27")}`,
        "Content-Length": String(object.size),
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  }
  throw new HttpError(404, "Not found.");
}
export default {
  async fetch(request, env) {
    let response: Response;
    try {
      response = await route(request, env);
    } catch (error) {
      if (error instanceof HttpError)
        response = Response.json(
          { error: error.message },
          { status: error.status },
        );
      else {
        console.error(
          JSON.stringify({
            event: "request_failed",
            path: new URL(request.url).pathname,
            error: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        response = Response.json(
          { error: "Something went wrong. Please try again." },
          { status: 500 },
        );
      }
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  },
  async email(message, env) {
    if (message.rawSize > MAX_EMAIL_BYTES) {
      message.setReject("Email exceeds 20 MB.");
      return;
    }
    const sender = message.from.toLowerCase();
    const config = parseMailConfig(env.MAIL_CONFIG);
    const allow = config.allowedForwarders.map((s) => s.toLowerCase());
    const domain = sender.slice(sender.lastIndexOf("@") + 1);
    if (
      !config.allowedSenderDomains.includes(domain) &&
      !allow.includes(sender)
    ) {
      message.setReject(
        "Sender is not an approved school sender or forwarder.",
      );
      return;
    }
    if (message.to.toLowerCase() !== config.inboundAddress.toLowerCase()) {
      message.setReject("Unknown archive address.");
      return;
    }
    try {
      const result = await ingestMail(
        env,
        await readLimited(message.raw, MAX_EMAIL_BYTES),
        message.to,
      );
      console.log(
        JSON.stringify({
          event: "email_stored",
          messages: result,
        }),
      );
    } catch (error) {
      if (error instanceof HttpError) {
        message.setReject(error.message);
        return;
      }
      console.error(JSON.stringify({ event: "email_storage_failed" }));
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
