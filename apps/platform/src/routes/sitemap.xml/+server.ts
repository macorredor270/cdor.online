import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://cdor.online/</loc></url>
  <url><loc>https://cdor.online/privacy</loc></url>
  <url><loc>https://cdor.online/terms</loc></url>
</urlset>`,
    { headers: { "content-type": "application/xml; charset=utf-8" } }
  );
