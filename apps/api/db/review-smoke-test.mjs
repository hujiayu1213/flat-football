/* global process, URL, fetch, FormData, Blob, console */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3002/api";
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("/catalog_test")) {
  throw new Error("Review smoke test requires the catalog_test database");
}

const client = new pg.Client({ connectionString: databaseUrl });
const createdUsers = [];
let profileId;
let verificationId;
let storageKey;
let connected = false;

async function testAccount(role) {
  const token = randomBytes(32).toString("base64url");
  const phone = `test-review-${role}-${randomBytes(5).toString("hex")}`;
  const userId = (await client.query("INSERT INTO users (phone) VALUES ($1) RETURNING id", [phone])).rows[0].id;
  createdUsers.push(userId);
  await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1,$2)", [userId, role]);
  if (role === "admin") await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'parent')", [userId]);
  await client.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,now()+interval '1 hour')",
    [userId, createHash("sha256").update(token).digest("hex")]);
  return { userId, token };
}

async function request(path, token, options = {}) {
  const headers = { origin: "http://localhost:3000", cookie: `ct_session=${token}` };
  if (typeof options.body === "string") headers["content-type"] = "application/json";
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  const body = await response.json();
  return { status: response.status, body };
}

try {
  await client.connect();
  connected = true;
  const admin = await testAccount("admin");
  const teacher = await testAccount("parent");
  const services = (await request("/subjects", teacher.token)).body;
  const flag = services.find((item) => item.service_key === "flag_football");
  const tutoring = services.find((item) => item.service_key === "tutoring");
  assert.ok(flag && tutoring);

  const application = {
    displayName: `审核测试老师${randomBytes(3).toString("hex")}`,
    school: "测试大学", grade: "大三", educationLevel: "本科在读",
    academicStrengths: "初中数学、英语阅读", serviceArea: "测试区域",
    bio: "喜欢陪孩子运动，也能支持他们学习。", experience: "曾参与青少年运动和学习辅导。",
    sportsExperience: "参加腰旗训练两年，并带领初学者练习传接球。",
    offerings: [
      { subjectId: flag.id, priceCents: 18000, durationMinutes: 60, ageRange: "10—15 岁",
        venueRequirements: "户外平整草地和运动鞋", guardianRequired: true },
      { subjectId: tutoring.id, priceCents: 12000, durationMinutes: 60, ageRange: "10—15 岁",
        venueRequirements: "", guardianRequired: false },
    ],
  };
  const form = new FormData();
  form.append("application", JSON.stringify(application));
  form.append("studentProof", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64")],
    { type: "image/png" }), "test-proof.png");
  const submitted = await request("/teacher-application", teacher.token, { method: "POST", body: form });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  verificationId = submitted.body.verificationId;
  assert.ok(verificationId);
  profileId = (await client.query("SELECT teacher_profile_id FROM verifications WHERE id=$1", [verificationId])).rows[0].teacher_profile_id;
  storageKey = (await client.query("SELECT storage_key FROM verification_files WHERE verification_id=$1", [verificationId])).rows[0].storage_key;

  assert.equal((await request("/teacher-application/me", teacher.token)).body.status, "submitted");
  assert.equal((await request("/teachers", teacher.token)).body.some((item) => item.id === profileId), false,
    "Submitted teacher must stay hidden until manual approval");
  assert.equal((await request("/admin/verifications?status=submitted", teacher.token)).status, 403);
  assert.equal((await request(`/admin/verifications/${verificationId}/decision`, teacher.token,
    { method: "POST", body: JSON.stringify({ decision: "approved", note: "" }) })).status, 403);
  await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [teacher.userId]);
  const selfReview = await request(`/admin/verifications/${verificationId}/decision`, teacher.token,
    { method: "POST", body: JSON.stringify({ decision: "approved", note: "" }) });
  assert.equal(selfReview.status, 403, "Administrator cannot approve their own application");
  assert.equal((await client.query("SELECT status FROM verifications WHERE id=$1", [verificationId])).rows[0].status, "submitted");

  const queue = await request("/admin/verifications?status=submitted", admin.token);
  assert.equal(queue.status, 200);
  assert.ok(queue.body.some((item) => item.id === verificationId));
  const detail = await request(`/admin/verifications/${verificationId}`, admin.token);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.application.educationLevel, "本科在读");
  assert.equal(detail.body.files.length, 1);
  const proof = await fetch(`${apiBaseUrl}/admin/verifications/${verificationId}/files/${detail.body.files[0].id}`,
    { headers: { cookie: `ct_session=${admin.token}` } });
  assert.equal(proof.status, 200, "Admin can view private proof");
  assert.equal(proof.headers.get("content-type"), "image/png");

  const decision = await request(`/admin/verifications/${verificationId}/decision`, admin.token,
    { method: "POST", body: JSON.stringify({ decision: "approved", note: "测试通过" }) });
  assert.equal(decision.status, 201, JSON.stringify(decision.body));
  assert.equal(decision.body.status, "approved");
  assert.equal((await request("/teachers", teacher.token)).body.some((item) => item.id === profileId), true);
  assert.equal((await request("/teacher-application/me", teacher.token)).body.status, "approved");
  assert.equal((await request(`/admin/verifications/${verificationId}/decision`, admin.token,
    { method: "POST", body: JSON.stringify({ decision: "approved", note: "" }) })).status, 409);
  console.log("PASS: submission stays hidden; self-review is blocked; another admin can review proof and approve");
} finally {
  if (connected) {
    if (verificationId) {
      await client.query("DELETE FROM notifications WHERE verification_id=$1", [verificationId]);
      await client.query("DELETE FROM verification_files WHERE verification_id=$1", [verificationId]);
      await client.query("DELETE FROM verifications WHERE id=$1", [verificationId]);
    }
    if (profileId) {
      await client.query("DELETE FROM teacher_subjects WHERE teacher_profile_id=$1", [profileId]);
      await client.query("DELETE FROM teacher_profiles WHERE id=$1", [profileId]);
    }
    for (const userId of createdUsers) {
      await client.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM user_roles WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM users WHERE id=$1", [userId]);
    }
    await client.end();
  }
  if (storageKey) await unlink(resolve(process.cwd(), "data/private-uploads", storageKey)).catch(() => undefined);
}
