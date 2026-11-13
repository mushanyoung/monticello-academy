export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  if (!env.IMPORT_TOKEN) return false;
  const value =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const encoder = new TextEncoder();
  const hashes = await Promise.all(
    [value, env.IMPORT_TOKEN].map((v) =>
      crypto.subtle.digest("SHA-256", encoder.encode(v)),
    ),
  );
  const [a, b] = hashes;
  return Boolean(a && b && crypto.subtle.timingSafeEqual(a, b));
}
