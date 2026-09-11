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

function str(v) {
  return v ? String(v).trim() || null : null;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const name = String(body.name || "").trim();
  if (!name) return json({ error: "Student name is required." }, 400);

  const ageGroup = str(body.ageGroup);
  const parentName = str(body.parentName);
  const parentContact = str(body.parentContact);
  const dateOfBirth = str(body.dateOfBirth);
  const enrollmentDate = str(body.enrollmentDate);
  const generalNotes = str(body.generalNotes);
  const medicalNotes = str(body.medicalNotes);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.STUDENT_TRACKER_DB
    .prepare(
      `INSERT INTO students
        (id, name, age_group, active, created_at, parent_name, parent_contact, date_of_birth, enrollment_date, general_notes, medical_notes)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, ageGroup, createdAt, parentName, parentContact, dateOfBirth, enrollmentDate, generalNotes, medicalNotes)
    .run();

  const student = await env.STUDENT_TRACKER_DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
  return json({ student });
}
