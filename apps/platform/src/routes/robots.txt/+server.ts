import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
  new Response(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /chat",
      "Disallow: /memories",
      "Disallow: /usage",
      "Disallow: /settings",
      "Disallow: /account",
      "Disallow: /api/",
      "Sitemap: https://cdor.online/sitemap.xml",
      ""
    ].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } }
  );
