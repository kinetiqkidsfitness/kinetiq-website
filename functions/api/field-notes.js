// Cloudflare Pages Function: /api/field-notes
// Handles reading and writing coach Field Notes, backed by D1 (FIELD_NOTES_DB).

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const moduleNumber = parseInt(body.moduleNumber, 10);
  const lessonNumber = parseInt(body.lessonNumber, 10);
  const lessonName = String(body.lessonName || "").trim();
  const classLetter = String(body.classLetter || "").trim().toUpperCase();
  const exercise = String(body.exercise || "").trim();
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  const note = String(body.note || "").trim();
  const coachName = body.coachName ? String(body.coachName).trim() : null;

  if (!moduleNumber || !lessonNumber || !lessonName || !["A", "B"].includes(classLetter) || !exercise) {
    return json({ error: "Missing required fields." }, 400);
  }
  if (!tags.length && !note) {
    return json({ error: "Add at least a tag or a note." }, 400);
  }

  const createdAt = new Date().toISOString();

  await env.FIELD_NOTES_DB.prepare(
    `INSERT INTO field_notes
      (module_number, lesson_number, lesson_name, class_letter, exercise, tags, note, coach_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(moduleNumber, lessonNumber, lessonName, classLetter, exercise, JSON.stringify(tags), note, coachName, createdAt)
    .run();

  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const moduleNumber = url.searchParams.get("module");

  let query = "SELECT * FROM field_notes";
  const params = [];
  if (moduleNumber) {
    query += " WHERE module_number = ?";
    params.push(parseInt(moduleNumber, 10));
  }
  query += " ORDER BY created_at DESC LIMIT 500";

  const stmt = params.length
    ? env.FIELD_NOTES_DB.prepare(query).bind(...params)
    : env.FIELD_NOTES_DB.prepare(query);

  const { results } = await stmt.all();
  const notes = results.map((r) => ({ ...r, tags: JSON.parse(r.tags || "[]") }));

  return json({ notes });
}
