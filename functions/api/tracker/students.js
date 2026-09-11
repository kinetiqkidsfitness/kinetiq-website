function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ env }) {
  const { results } = await env.STUDENT_TRACKER_DB
    .prepare("SELECT * FROM students WHERE active = 1 ORDER BY name ASC")
    .all();
  return json({ students: results });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const name = String(body.name || "").trim();
  const ageGroup = body.ageGroup ? String(body.ageGroup).trim() : null;
  if (!name) return json({ error: "Student name is required." }, 400);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.STUDENT_TRACKER_DB
    .prepare("INSERT INTO students (id, name, age_group, active, created_at) VALUES (?, ?, ?, 1, ?)")
    .bind(id, name, ageGroup, createdAt)
    .run();

  return json({ student: { id, name, age_group: ageGroup, active: 1, created_at: createdAt } });
}
