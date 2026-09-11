function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ request, params, env }) {
  const student = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM students WHERE id = ?").bind(params.studentId).first();
  if (!student) return json({ error: "Student not found." }, 404);

  const url = new URL(request.url);
  const moduleId = url.searchParams.get("module");

  let query = `
    SELECT
      r.id, r.class_session_id, r.attendance_status,
      r.skill_competency_score, r.skill_competency_status,
      r.confidence_score, r.confidence_status,
      r.balance_control_score, r.balance_control_status,
      r.focus_directions_score, r.focus_directions_status,
      r.effort_resilience_score, r.effort_resilience_status,
      r.coach_note, r.status,
      s.date, s.start_time, s.module_id, s.module_name, s.lesson_number, s.lesson_name,
      s.class_type, s.featured_skill, s.coach_name, s.location_name
    FROM student_class_records r
    JOIN class_sessions s ON s.id = r.class_session_id
    WHERE r.student_id = ?
  `;
  const bindings = [params.studentId];
  if (moduleId) {
    query += " AND s.module_id = ?";
    bindings.push(parseInt(moduleId, 10));
  }
  query += " ORDER BY s.date ASC, s.start_time ASC";

  const { results } = await env.STUDENT_TRACKER_DB.prepare(query).bind(...bindings).all();

  const { results: moduleRows } = await env.STUDENT_TRACKER_DB
    .prepare(
      `SELECT DISTINCT s.module_id, s.module_name FROM student_class_records r
       JOIN class_sessions s ON s.id = r.class_session_id
       WHERE r.student_id = ? ORDER BY s.module_id ASC`
    )
    .bind(params.studentId)
    .all();

  return json({ student, records: results, modules: moduleRows });
}
