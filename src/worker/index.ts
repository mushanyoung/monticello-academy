export default {
  fetch(request: Request) {
    if (new URL(request.url).pathname === "/api/health")
      return Response.json({ status: "ok" });
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
