function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ params, env }) {
  const student = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM students WHERE id = ?").bind(params.id).first();
  if (!student) return json({ error: "Student not found." }, 404);
  return json({ student });
}

const EDITABLE = {
  name: "name",
  ageGroup: "age_group",
  parentName: "parent_name",
  parentContact: "parent_contact",
  dateOfBirth: "date_of_birth",
  enrollmentDate: "enrollment_date",
  generalNotes: "general_notes",
  medicalNotes: "medical_notes",
};

export async function onRequestPatch({ request, params, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const existing = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM students WHERE id = ?").bind(params.id).first();
  if (!existing) return json({ error: "Student not found." }, 404);

  if (body.name !== undefined && !String(body.name).trim()) {
    return json({ error: "Student name cannot be blank." }, 400);
  }

  const setClauses = [];
  const values = [];
  for (const [key, col] of Object.entries(EDITABLE)) {
    if (body[key] !== undefined) {
      const v = body[key] === null ? null : String(body[key]).trim() || null;
      setClauses.push(`${col} = ?`);
      values.push(v);
    }
  }

  if (setClauses.length) {
    values.push(params.id);
    await env.STUDENT_TRACKER_DB
      .prepare(`UPDATE students SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  const updated = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM students WHERE id = ?").bind(params.id).first();
  return json({ student: updated });
}
