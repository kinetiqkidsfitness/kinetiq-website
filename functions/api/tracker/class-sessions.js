function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const conditions = [];
  const params = [];

  const map = {
    module: "module_id",
    lesson: "lesson_number",
    classType: "class_type",
    coachId: "coach_id",
    locationId: "location_id",
    dateFrom: null,
    dateTo: null,
  };

  const moduleId = url.searchParams.get("module");
  if (moduleId) { conditions.push("module_id = ?"); params.push(parseInt(moduleId, 10)); }
  const lesson = url.searchParams.get("lesson");
  if (lesson) { conditions.push("lesson_number = ?"); params.push(parseInt(lesson, 10)); }
  const classType = url.searchParams.get("classType");
  if (classType) { conditions.push("class_type = ?"); params.push(classType); }
  const coachId = url.searchParams.get("coachId");
  if (coachId) { conditions.push("coach_id = ?"); params.push(coachId); }
  const locationId = url.searchParams.get("locationId");
  if (locationId) { conditions.push("location_id = ?"); params.push(locationId); }
  const dateFrom = url.searchParams.get("dateFrom");
  if (dateFrom) { conditions.push("date >= ?"); params.push(dateFrom); }
  const dateTo = url.searchParams.get("dateTo");
  if (dateTo) { conditions.push("date <= ?"); params.push(dateTo); }

  let query = "SELECT * FROM class_sessions";
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY date DESC, start_time DESC LIMIT 500";

  const stmt = params.length ? env.STUDENT_TRACKER_DB.prepare(query).bind(...params) : env.STUDENT_TRACKER_DB.prepare(query);
  const { results } = await stmt.all();
  return json({ sessions: results });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const required = ["date", "moduleId", "moduleName", "lessonNumber", "lessonName", "classType", "featuredSkill", "coachId", "coachName"];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      return json({ error: `Missing required field: ${key}` }, 400);
    }
  }
  if (!["A", "B"].includes(body.classType)) {
    return json({ error: "classType must be 'A' or 'B'." }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.STUDENT_TRACKER_DB
    .prepare(
      `INSERT INTO class_sessions
        (id, date, start_time, module_id, module_name, lesson_number, lesson_name, class_type,
         featured_skill, coach_id, coach_name, location_id, location_name, age_group,
         status, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
    )
    .bind(
      id,
      body.date,
      body.startTime || null,
      parseInt(body.moduleId, 10),
      body.moduleName,
      parseInt(body.lessonNumber, 10),
      body.lessonName,
      body.classType,
      body.featuredSkill,
      body.coachId,
      body.coachName,
      body.locationId || null,
      body.locationName || null,
      body.ageGroup || null,
      body.actorName || body.coachName,
      now,
      body.actorName || body.coachName,
      now
    )
    .run();

  const session = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM class_sessions WHERE id = ?").bind(id).first();
  return json({ session });
}
