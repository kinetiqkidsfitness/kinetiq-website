function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const name = String(body.name || "").trim();
  const org = body.org ? String(body.org).trim() : null;
  const email = String(body.email || "").trim();
  const programType = body.type ? String(body.type).trim() : null;

  if (!name || !email || !EMAIL_RE.test(email)) {
    return json({ error: "A name and valid email are required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.SITE_LEADS_DB
    .prepare(
      "INSERT INTO partner_inquiries (id, name, org, email, program_type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, name, org, email, programType, now)
    .run();

  return json({ success: true });
}
