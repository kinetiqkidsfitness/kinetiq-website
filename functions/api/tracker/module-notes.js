function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId");
  const moduleId = url.searchParams.get("moduleId");
  if (!studentId || !moduleId) {
    return json({ error: "studentId and moduleId are required." }, 400);
  }

  const note = await env.STUDENT_TRACKER_DB
    .prepare("SELECT * FROM module_report_notes WHERE student_id = ? AND module_id = ?")
    .bind(studentId, parseInt(moduleId, 10))
    .first();

  return json({ note: note || null });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const studentId = String(body.studentId || "");
  const moduleId = parseInt(body.moduleId, 10);
  if (!studentId || !Number.isInteger(moduleId)) {
    return json({ error: "studentId and moduleId are required." }, 400);
  }

  const greatestStrength = body.greatestStrength ? String(body.greatestStrength).trim() || null : null;
  const biggestImprovement = body.biggestImprovement ? String(body.biggestImprovement).trim() || null : null;
  const nextStep = body.nextStep ? String(body.nextStep).trim() || null : null;
  const actor = body.actorName || "Unknown coach";
  const now = new Date().toISOString();

  const existing = await env.STUDENT_TRACKER_DB
    .prepare("SELECT * FROM module_report_notes WHERE student_id = ? AND module_id = ?")
    .bind(studentId, moduleId)
    .first();

  const id = existing ? existing.id : crypto.randomUUID();

  if (existing) {
    await env.STUDENT_TRACKER_DB
      .prepare(
        `UPDATE module_report_notes SET
          greatest_strength = ?, biggest_improvement = ?, next_step = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(greatestStrength, biggestImprovement, nextStep, actor, now, id)
      .run();
  } else {
    await env.STUDENT_TRACKER_DB
      .prepare(
        `INSERT INTO module_report_notes
          (id, student_id, module_id, greatest_strength, biggest_improvement, next_step, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, studentId, moduleId, greatestStrength, biggestImprovement, nextStep, actor, now, actor, now)
      .run();
  }

  const saved = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM module_report_notes WHERE id = ?").bind(id).first();
  return json({ note: saved });
}
