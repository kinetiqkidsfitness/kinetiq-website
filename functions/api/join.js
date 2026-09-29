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

  const firstName = String(body.first || "").trim();
  const email = String(body.email || "").trim();
  const childAge = body.age ? String(body.age).trim() : null;
  const zip = body.zip ? String(body.zip).trim() : null;

  if (!firstName || !email || !EMAIL_RE.test(email)) {
    return json({ error: "A first name and valid email are required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.SITE_LEADS_DB
    .prepare(
      "INSERT INTO early_access_signups (id, first_name, email, child_age, zip, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, firstName, email, childAge, zip, now)
    .run();

  return json({ success: true });
}
