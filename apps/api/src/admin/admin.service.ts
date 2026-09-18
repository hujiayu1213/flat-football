import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";
import { PrivateFilesService } from "../teacher-application/private-files.service";
import { ApplicationInput, OfferingInput } from "../teacher-application/teacher-application.types";
import { OfferingChangeInput, ProfileChangeInput } from "../teacher-profile/teacher-profile.service";

interface ReviewRow extends QueryResultRow {
  id: string;
  status: string;
  type: string;
  submitted_at: Date;
  reviewed_at: Date | null;
  review_note: string | null;
  reviewed_by: string | null;
  submitted_snapshot: ApplicationInput | ProfileChangeInput | OfferingChangeInput;
  teacher_profile_id: string;
  user_id: string;
  user_status: string;
  display_name: string;
  school: string;
  service_area: string;
  phone: string;
  profile_status: string;
  current_bio: string;
  sports_experience: string;
  academic_strengths: string;
  education_level: string;
}

interface ProofRow extends QueryResultRow {
  id: string;
  kind: string;
  mime_type: string;
  byte_size: number;
  storage_key: string;
}

type Decision = "approved" | "changes_requested" | "rejected";

@Injectable()
export class AdminService {
  constructor(private readonly database: DatabaseService, private readonly files: PrivateFilesService) {}

  async list(status: string, type?: string): Promise<object[]> {
    const rows = await this.database.query<ReviewRow>(
      `SELECT v.id, v.type, v.status, v.submitted_at, tp.display_name, tp.school, tp.service_area, u.phone
       FROM verifications v
       JOIN teacher_profiles tp ON tp.id = v.teacher_profile_id
       JOIN users u ON u.id = tp.user_id
       WHERE v.status = $1 AND ($2::text IS NULL OR v.type = $2)
       ORDER BY v.submitted_at ASC, v.id ASC LIMIT 100`, [status, type ?? null],
    );
    return rows.map((row) => ({ id: row.id, type: row.type, status: row.status, submittedAt: row.submitted_at,
      displayName: row.display_name, school: row.school, serviceArea: row.service_area, phone: row.phone }));
  }

  async detail(id: string): Promise<object> {
    const row = await this.findReview(id);
    const [files, currentOfferings] = await Promise.all([
      this.database.query<ProofRow>(
        "SELECT id, kind, mime_type, byte_size FROM verification_files WHERE verification_id = $1 ORDER BY kind", [id],
      ),
      this.database.query<QueryResultRow>(
        `SELECT ts.subject_id, s.name AS subject_name, ts.price_cents, ts.duration_minutes
         FROM teacher_subjects ts JOIN subjects s ON s.id=ts.subject_id
         WHERE ts.teacher_profile_id=$1 AND ts.status='active' ORDER BY s.name`, [row.teacher_profile_id],
      ),
    ]);
    return { id: row.id, type: row.type, status: row.status, submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by, reviewNote: row.review_note,
      displayName: row.display_name, school: row.school, serviceArea: row.service_area,
      currentBio: row.current_bio, currentSportsExperience: row.sports_experience,
      currentAcademicStrengths: row.academic_strengths, currentEducationLevel: row.education_level, phone: row.phone,
      application: row.submitted_snapshot,
      currentOfferings: currentOfferings.map((item) => ({ subjectId: item.subject_id, subjectName: item.subject_name,
        priceCents: item.price_cents, durationMinutes: item.duration_minutes })),
      files: files.map((file) => ({ id: file.id, kind: file.kind, mimeType: file.mime_type, byteSize: file.byte_size })),
    };
  }

  async proof(verificationId: string, fileId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const rows = await this.database.query<ProofRow>(
      "SELECT storage_key, mime_type FROM verification_files WHERE verification_id = $1 AND id = $2",
      [verificationId, fileId],
    );
    if (!rows[0]) throw new NotFoundException("证明文件不存在");
    try { return { bytes: await this.files.read(rows[0].storage_key), mimeType: rows[0].mime_type }; }
    catch { throw new NotFoundException("证明文件无法读取"); }
  }

  async decide(id: string, adminId: string, decision: Decision, note: string): Promise<{ status: Decision }> {
    return this.database.transaction(async (client) => {
      const row = (await client.query<ReviewRow>(
        `SELECT v.id, v.type, v.status, v.submitted_snapshot, v.teacher_profile_id,
                tp.user_id, tp.status AS profile_status, u.status AS user_status
         FROM verifications v
         JOIN teacher_profiles tp ON tp.id = v.teacher_profile_id
         JOIN users u ON u.id = tp.user_id
         WHERE v.id = $1 FOR UPDATE OF v, tp`, [id],
      )).rows[0];
      if (!row) throw new NotFoundException("审核申请不存在");
      if (row.status !== "submitted") throw new ConflictException("该申请已处理");
      if (row.user_id === adminId) throw new ForbiddenException("不能审核自己的申请");
      if (row.user_status !== "active") throw new ConflictException("申请账号已停用");
      if (row.type === "initial") {
        if (row.profile_status !== "pending") throw new ConflictException("老师资料状态已变化");
        if (decision === "approved") {
          const snapshot = row.submitted_snapshot as ApplicationInput;
          const ids = snapshot.offerings.map((offering) => offering.subjectId);
          const active = await client.query("SELECT id FROM subjects WHERE id = ANY($1::uuid[]) AND status = 'active' AND service_key IS NOT NULL", [ids]);
          if (active.rowCount !== ids.length) throw new ConflictException("申请中的教学项目已不在当前服务范围，请先退回修改");
          await client.query("DELETE FROM teacher_subjects WHERE teacher_profile_id = $1", [row.teacher_profile_id]);
          for (const offering of snapshot.offerings) {
            await client.query(
              `INSERT INTO teacher_subjects (teacher_profile_id, subject_id, price_cents, duration_minutes, age_range, venue_requirements, guardian_required)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [row.teacher_profile_id, offering.subjectId, offering.priceCents, offering.durationMinutes,
                offering.ageRange, offering.venueRequirements || null, offering.guardianRequired],
            );
          }
          await client.query(
            `UPDATE teacher_profiles SET display_name=$2, school=$3, grade=$4, education_level=$5,
             academic_strengths=$6, service_area=$7, bio=$8, experience=$9, sports_experience=$10,
             status='active', accepting_bookings=true,
             approved_at=now(), updated_at=now() WHERE id=$1`,
            [row.teacher_profile_id, snapshot.displayName, snapshot.school, snapshot.grade,
              snapshot.educationLevel, snapshot.academicStrengths, snapshot.serviceArea,
              snapshot.bio, snapshot.experience, snapshot.sportsExperience],
          );
          await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'teacher') ON CONFLICT DO NOTHING", [row.user_id]);
        } else {
          await client.query(
            "UPDATE teacher_profiles SET status=$2, accepting_bookings=false, updated_at=now() WHERE id=$1",
            [row.teacher_profile_id, decision === "rejected" ? "rejected" : "pending"],
          );
        }
      } else if (row.type === "profile_change") {
        if (row.profile_status !== "active") throw new ConflictException("老师资料状态已变化");
        if (decision === "approved") {
          const snapshot = row.submitted_snapshot as ProfileChangeInput;
          await client.query(
            "UPDATE teacher_profiles SET service_area=$2, bio=$3, updated_at=now() WHERE id=$1",
            [row.teacher_profile_id, snapshot.serviceArea, snapshot.bio],
          );
        }
      } else if (row.type === "qualification_change") {
        if (row.profile_status !== "active") throw new ConflictException("老师资料状态已变化");
        if (decision === "approved") {
          const snapshot = row.submitted_snapshot as OfferingChangeInput;
          const ids = snapshot.offerings.map((offering) => offering.subjectId);
          const subjects = (await client.query<{ id: string; category: string; service_key: string }>(
            "SELECT id, category, service_key FROM subjects WHERE id=ANY($1::uuid[]) AND status='active' AND service_key IS NOT NULL", [ids],
          )).rows;
          if (subjects.length !== ids.length) throw new ConflictException("申请中的教学项目已下架，请先退回修改");
          const categories = new Map(subjects.map((subject) => [subject.id, subject.category]));
          if (subjects.some((subject) => subject.service_key === "tutoring") && (snapshot.academicStrengths?.length ?? 0) < 2) {
            throw new ConflictException("家教擅长科目资料不足，请先退回修改");
          }
          if (snapshot.offerings.some((offering) => categories.get(offering.subjectId) === "sports") && snapshot.sportsExperience.length < 10) {
            throw new ConflictException("体育经历资料不足，请先退回修改");
          }
          await client.query("UPDATE teacher_subjects SET status='paused' WHERE teacher_profile_id=$1 AND status='active'", [row.teacher_profile_id]);
          for (const offering of snapshot.offerings as OfferingInput[]) {
            await client.query(
              `INSERT INTO teacher_subjects (teacher_profile_id, subject_id, price_cents, duration_minutes, age_range, venue_requirements, guardian_required, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
               ON CONFLICT (teacher_profile_id, subject_id, duration_minutes)
               DO UPDATE SET price_cents=EXCLUDED.price_cents, age_range=EXCLUDED.age_range,
                             venue_requirements=EXCLUDED.venue_requirements,
                             guardian_required=EXCLUDED.guardian_required, status='active'`,
              [row.teacher_profile_id, offering.subjectId, offering.priceCents, offering.durationMinutes,
                offering.ageRange, offering.venueRequirements || null, offering.guardianRequired],
            );
          }
          await client.query("UPDATE teacher_profiles SET sports_experience=$2, academic_strengths=$3, updated_at=now() WHERE id=$1",
            [row.teacher_profile_id, snapshot.sportsExperience, snapshot.academicStrengths ?? ""]);
        }
      } else {
        throw new ConflictException("此类申请暂不支持审核");
      }
      await client.query(
        "UPDATE verifications SET status=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4 WHERE id=$1",
        [id, decision, adminId, note || null],
      );
      await client.query(
        "INSERT INTO notifications (recipient_user_id, verification_id, type) VALUES ($1, $2, $3)",
        [row.user_id, id, `verification_${decision}`],
      );
      return { status: decision };
    });
  }

  private async findReview(id: string): Promise<ReviewRow> {
    const rows = await this.database.query<ReviewRow>(
      `SELECT v.*, tp.user_id, tp.display_name, tp.school, tp.service_area,
              tp.bio AS current_bio, tp.sports_experience, tp.academic_strengths, tp.education_level, u.phone
       FROM verifications v JOIN teacher_profiles tp ON tp.id = v.teacher_profile_id
       JOIN users u ON u.id = tp.user_id WHERE v.id = $1`, [id],
    );
    if (!rows[0]) throw new NotFoundException("审核申请不存在");
    return rows[0];
  }
}
