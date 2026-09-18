/* global process, URL, fetch, console */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3002/api";
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("/catalog_test")) {
  throw new Error("Smoke test requires the catalog_test database");
}

const client = new pg.Client({ connectionString: databaseUrl });
const token = randomBytes(32).toString("base64url");
const phone = `test-smoke-${randomBytes(6).toString("hex")}`;
let userId;
let bookingId;

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { origin: "http://localhost:3000", cookie: `ct_session=${token}`,
      "content-type": "application/json", ...options.headers },
  });
  const body = await response.json();
  return { status: response.status, body };
}

try {
  await client.connect();
  const services = await request("/subjects");
  assert.equal(services.status, 200);
  assert.deepEqual(services.body.map((service) => service.service_key), ["flag_football", "tutoring"]);

  const teachers = await request("/teachers");
  assert.equal(teachers.status, 200);
  assert.ok(teachers.body.some((teacher) => teacher.offerings.some((offering) => offering.serviceKey === "flag_football")));
  assert.ok(teachers.body.some((teacher) => teacher.offerings.some((offering) => offering.serviceKey === "tutoring")));
  assert.ok(teachers.body.every((teacher) => teacher.offerings.every((offering) => offering.serviceKey)));

  userId = (await client.query("INSERT INTO users (phone) VALUES ($1) RETURNING id", [phone])).rows[0].id;
  await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'parent')", [userId]);
  await client.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
    [userId, createHash("sha256").update(token).digest("hex")]);
  assert.equal((await request("/admin/subjects")).status, 403, "Parent cannot manage services");

  const tutoring = teachers.body.flatMap((teacher) => teacher.offerings).find((offering) => offering.serviceKey === "tutoring");
  const legacy = (await client.query(`SELECT ts.id FROM teacher_subjects ts JOIN subjects s ON s.id=ts.subject_id
    WHERE s.service_key IS NULL LIMIT 1`)).rows[0];
  assert.ok(tutoring && legacy);
  const input = { startsAt: new Date(Date.now() + 3 * 86400000).toISOString(), childAge: 12,
    meetingArea: "测试区域", note: "" };
  const post = (offeringId, note) => request("/bookings", { method: "POST",
    body: JSON.stringify({ ...input, offeringId, note }) });

  assert.equal((await post(tutoring.id, "")).status, 400, "Tutoring requires a subject and goal");
  assert.equal((await post(legacy.id, "初中数学，希望补基础")).status, 404, "Legacy offerings cannot be booked");
  const created = await post(tutoring.id, "初中数学，希望补基础");
  assert.equal(created.status, 201, JSON.stringify(created.body));
  bookingId = created.body.id;
  assert.ok(bookingId);
  assert.equal((await request("/bookings/mine")).body.some((booking) => booking.id === bookingId), true);
  const cancelled = await request(`/bookings/${bookingId}/cancel`, { method: "POST" });
  assert.equal(cancelled.status, 201, JSON.stringify(cancelled.body));

  await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [userId]);
  const managed = await request("/admin/subjects");
  assert.equal(managed.status, 200);
  assert.deepEqual(managed.body.map((service) => service.name), ["腰旗橄榄球", "学科家教"]);
  assert.equal((await request("/admin/subjects", { method: "POST",
    body: JSON.stringify({ name: "篮球", category: "sports", sortOrder: 30 }) })).status, 409);
  assert.equal((await request("/admin/verifications?status=submitted")).status, 200);
  console.log("PASS: catalog, booking rules, booking lifecycle, admin access and two-service management");
} finally {
  if (bookingId) {
    await client.query("DELETE FROM notifications WHERE booking_id=$1", [bookingId]);
    await client.query("DELETE FROM bookings WHERE id=$1", [bookingId]);
  }
  if (userId) {
    await client.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_roles WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM users WHERE id=$1", [userId]);
  }
  await client.end();
}
