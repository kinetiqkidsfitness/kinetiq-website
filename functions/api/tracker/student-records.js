function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const CATEGORIES = [
  { key: "skillCompetency", scoreCol: "skill_competency_score", statusCol: "skill_competency_status" },
  { key: "confidence", scoreCol: "confidence_score", statusCol: "confidence_status" },
  { key: "balanceControl", scoreCol: "balance_control_score", statusCol: "balance_control_status" },
  { key: "focusDirections", scoreCol: "focus_directions_score", statusCol: "focus_directions_status" },
  { key: "effortResilience", scoreCol: "effort_resilience_score", statusCol: "effort_resilience_status" },
];

// A rating is one of: { status: "rated", score: 1-10 } | { status: "not_observed" } | { status: "incomplete" }
function parseRating(r) {
  if (!r || typeof r !== "object") return { status: "incomplete", score: null };
  if (r.status === "not_observed") return { status: "not_observed", score: null };
  if (r.status === "rated") {
    const n = parseInt(r.score, 10);
    if (!Number.isInteger(n) || n < 1 || n > 10) return { status: "incomplete", score: null };
    return { status: "rated", score: n };
  }
  return { status: "incomplete", score: null };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("classSessionId");
  const studentId = url.searchParams.get("studentId");

  let query = "SELECT * FROM student_class_records";
  const conditions = [];
  const params = [];
  if (sessionId) { conditions.push("class_session_id = ?"); params.push(sessionId); }
  if (studentId) { conditions.push("student_id = ?"); params.push(studentId); }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY created_at ASC";

  const stmt = params.length ? env.STUDENT_TRACKER_DB.prepare(query).bind(...params) : env.STUDENT_TRACKER_DB.prepare(query);
  const { results } = await stmt.all();
  return json({ records: results });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const classSessionId = String(body.classSessionId || "");
  const studentId = String(body.studentId || "");
  const studentName = String(body.studentName || "").trim();
  const attendanceStatus = String(body.attendanceStatus || "");
  const actor = body.actorName || "Unknown coach";

  if (!classSessionId || !studentId || !studentName) {
    return json({ error: "classSessionId, studentId, and studentName are required." }, 400);
  }
  if (!["present", "absent", "late", "left_early"].includes(attendanceStatus)) {
    return json({ error: "Invalid attendanceStatus." }, 400);
  }

  const ratings = body.ratings || {};
  const parsed = {};
  for (const cat of CATEGORIES) {
    parsed[cat.key] = attendanceStatus === "absent" ? { status: "incomplete", score: null } : parseRating(ratings[cat.key]);
  }

  const note = body.coachNote ? String(body.coachNote).trim() : null;
  const now = new Date().toISOString();

  const existing = await env.STUDENT_TRACKER_DB
    .prepare("SELECT * FROM student_class_records WHERE class_session_id = ? AND student_id = ?")
    .bind(classSessionId, studentId)
    .first();

  const wasSubmitted = existing && existing.status === "submitted";
  const id = existing ? existing.id : crypto.randomUUID();

  if (existing) {
    await env.STUDENT_TRACKER_DB
      .prepare(
        `UPDATE student_class_records SET
          student_name = ?, attendance_status = ?,
          skill_competency_score = ?, skill_competency_status = ?,
          confidence_score = ?, confidence_status = ?,
          balance_control_score = ?, balance_control_status = ?,
          focus_directions_score = ?, focus_directions_status = ?,
          effort_resilience_score = ?, effort_resilience_status = ?,
          coach_note = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        studentName, attendanceStatus,
        parsed.skillCompetency.score, parsed.skillCompetency.status,
        parsed.confidence.score, parsed.confidence.status,
        parsed.balanceControl.score, parsed.balanceControl.status,
        parsed.focusDirections.score, parsed.focusDirections.status,
        parsed.effortResilience.score, parsed.effortResilience.status,
        note, actor, now, id
      )
      .run();
  } else {
    await env.STUDENT_TRACKER_DB
      .prepare(
        `INSERT INTO student_class_records
          (id, class_session_id, student_id, student_name, attendance_status,
           skill_competency_score, skill_competency_status,
           confidence_score, confidence_status,
           balance_control_score, balance_control_status,
           focus_directions_score, focus_directions_status,
           effort_resilience_score, effort_resilience_status,
           coach_note, status, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
      )
      .bind(
        id, classSessionId, studentId, studentName, attendanceStatus,
        parsed.skillCompetency.score, parsed.skillCompetency.status,
        parsed.confidence.score, parsed.confidence.status,
        parsed.balanceControl.score, parsed.balanceControl.status,
        parsed.focusDirections.score, parsed.focusDirections.status,
        parsed.effortResilience.score, parsed.effortResilience.status,
        note, actor, now, actor, now
      )
      .run();
  }

  if (wasSubmitted) {
    await env.STUDENT_TRACKER_DB
      .prepare(
        "INSERT INTO tracker_edit_history (table_name, record_id, changed_by, changed_at, change_summary) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("student_class_records", id, actor, now, JSON.stringify(body))
      .run();
  }

  const saved = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM student_class_records WHERE id = ?").bind(id).first();
  return json({ record: saved });
}
