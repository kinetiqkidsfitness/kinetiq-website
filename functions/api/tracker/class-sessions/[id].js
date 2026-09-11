function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const RATING_KEYS = [
  ["skill_competency_score", "skill_competency_status"],
  ["confidence_score", "confidence_status"],
  ["balance_control_score", "balance_control_status"],
  ["focus_directions_score", "focus_directions_status"],
  ["effort_resilience_score", "effort_resilience_status"],
];

export async function onRequestGet({ params, env }) {
  const session = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM class_sessions WHERE id = ?").bind(params.id).first();
  if (!session) return json({ error: "Session not found." }, 404);

  const { results } = await env.STUDENT_TRACKER_DB
    .prepare("SELECT * FROM student_class_records WHERE class_session_id = ? ORDER BY student_name ASC")
    .bind(params.id)
    .all();

  return json({ session, records: results });
}

export async function onRequestPatch({ request, params, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const session = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM class_sessions WHERE id = ?").bind(params.id).first();
  if (!session) return json({ error: "Session not found." }, 404);

  const actor = body.actorName || "Unknown coach";
  const now = new Date().toISOString();
  const wasSubmitted = session.status === "submitted";

  // Submitting: validate every attended (present/late/left_early) student has
  // all five categories either rated or explicitly marked not_observed.
  if (body.status === "submitted" && session.status !== "submitted") {
    const { results: records } = await env.STUDENT_TRACKER_DB
      .prepare("SELECT * FROM student_class_records WHERE class_session_id = ?")
      .bind(params.id)
      .all();

    const incomplete = [];
    for (const r of records) {
      if (r.attendance_status === "absent") continue;
      const missing = RATING_KEYS.filter(([, statusKey]) => r[statusKey] === "incomplete");
      if (missing.length) incomplete.push({ studentName: r.student_name, missingCount: missing.length });
    }
    if (incomplete.length) {
      return json({ error: "Some attended children have incomplete ratings.", incomplete }, 422);
    }

    await env.STUDENT_TRACKER_DB
      .prepare("UPDATE student_class_records SET status = 'submitted', updated_by = ?, updated_at = ? WHERE class_session_id = ?")
      .bind(actor, now, params.id)
      .run();

    await env.STUDENT_TRACKER_DB
      .prepare("UPDATE class_sessions SET status = 'submitted', submitted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      .bind(now, actor, now, params.id)
      .run();
  } else {
    // General field edit (date/coach/location/etc.) without changing submit status.
    const editable = ["date", "startTime", "featuredSkill", "coachId", "coachName", "locationId", "locationName", "ageGroup"];
    const setClauses = [];
    const values = [];
    const colMap = {
      date: "date", startTime: "start_time", featuredSkill: "featured_skill",
      coachId: "coach_id", coachName: "coach_name", locationId: "location_id",
      locationName: "location_name", ageGroup: "age_group",
    };
    for (const key of editable) {
      if (body[key] !== undefined) {
        setClauses.push(`${colMap[key]} = ?`);
        values.push(body[key]);
      }
    }
    if (setClauses.length) {
      setClauses.push("updated_by = ?", "updated_at = ?");
      values.push(actor, now, params.id);
      await env.STUDENT_TRACKER_DB
        .prepare(`UPDATE class_sessions SET ${setClauses.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();
    }
  }

  if (wasSubmitted) {
    await env.STUDENT_TRACKER_DB
      .prepare(
        "INSERT INTO tracker_edit_history (table_name, record_id, changed_by, changed_at, change_summary) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("class_sessions", params.id, actor, now, JSON.stringify(body))
      .run();
  }

  const updated = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM class_sessions WHERE id = ?").bind(params.id).first();
  return json({ session: updated });
}
