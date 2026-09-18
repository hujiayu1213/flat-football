import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";

interface OfferingRow extends QueryResultRow {
  id: string; teacher_profile_id: string; teacher_user_id: string;
  service_key: string;
  duration_minutes: number; price_cents: number; guardian_required: boolean;
}

interface TeacherBookingRow extends QueryResultRow {
  id: string; status: string; starts_at: Date; duration_minutes: number;
  teacher_profile_id: string; profile_status: string;
}

@Injectable()
export class BookingsService {
  constructor(private readonly database: DatabaseService) {}

  async create(parentId: string, input: { offeringId: string; startsAt: string; childAge: number; meetingArea: string; note: string }): Promise<object> {
    try {
      return await this.database.transaction(async (client) => {
        const offering = (await client.query<OfferingRow>(
          `SELECT ts.id, ts.teacher_profile_id, tp.user_id AS teacher_user_id, s.service_key,
                  ts.duration_minutes, ts.price_cents, ts.guardian_required
           FROM teacher_subjects ts JOIN teacher_profiles tp ON tp.id = ts.teacher_profile_id
           JOIN users u ON u.id = tp.user_id JOIN subjects s ON s.id = ts.subject_id
           WHERE ts.id = $1 AND ts.status = 'active' AND tp.status = 'active'
             AND tp.accepting_bookings = true AND tp.approved_at IS NOT NULL
             AND u.status = 'active' AND s.status = 'active' AND s.service_key IS NOT NULL
           FOR SHARE OF ts, tp, u, s`, [input.offeringId],
        )).rows[0];
        if (!offering) throw new NotFoundException("该课程暂不可预约");
        if (offering.teacher_user_id === parentId) throw new ForbiddenException("不能预约自己的课程");
        if (offering.service_key === "tutoring" && input.note.trim().length < 2) {
          throw new BadRequestException("预约家教时请在需求中填写想辅导的科目和学习目标");
        }
        const booking = (await client.query<{ id: string; status: string }>(
          `INSERT INTO bookings (parent_user_id, teacher_profile_id, teacher_subject_id, starts_at,
            duration_minutes, price_cents, child_age, meeting_area, request_note, guardian_required)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, status`,
          [parentId, offering.teacher_profile_id, offering.id, input.startsAt, offering.duration_minutes,
            offering.price_cents, input.childAge, input.meetingArea, input.note, offering.guardian_required],
        )).rows[0];
        await client.query(
          "INSERT INTO notifications (recipient_user_id, booking_id, type) VALUES ($1,$2,'booking_requested')",
          [offering.teacher_user_id, booking.id],
        );
        return booking;
      });
    } catch (error) {
      // Recheck the unique request key so a duplicate receives a useful conflict response.
      const matches = await this.database.query<{ id: string }>(
        `SELECT id FROM bookings WHERE parent_user_id=$1 AND teacher_subject_id=$2 AND starts_at=$3
         AND status IN ('requested','confirmed')`, [parentId, input.offeringId, input.startsAt],
      );
      if (matches.length) throw new ConflictException("您已提交过相同时间的预约");
      throw error;
    }
  }

  async mine(parentId: string): Promise<object[]> {
    const rows = await this.database.query<QueryResultRow>(
      `SELECT b.id, b.status, b.starts_at, b.duration_minutes, b.price_cents,
              b.child_age, b.meeting_area, b.request_note, b.guardian_required,
              b.created_at, b.teacher_response_note, b.responded_at,
              b.cancelled_by, b.cancellation_reason, b.cancelled_at, b.completed_at,
              tp.id AS teacher_id, tp.display_name AS teacher_name,
              s.name AS subject_name, s.category
       FROM bookings b JOIN teacher_profiles tp ON tp.id = b.teacher_profile_id
       JOIN teacher_subjects ts ON ts.id = b.teacher_subject_id
       JOIN subjects s ON s.id = ts.subject_id
       WHERE b.parent_user_id = $1 ORDER BY b.created_at DESC LIMIT 100`, [parentId],
    );
    return rows.map((row) => ({ id: row.id, status: row.status, startsAt: row.starts_at,
      durationMinutes: row.duration_minutes, priceCents: row.price_cents, childAge: row.child_age,
      meetingArea: row.meeting_area, note: row.request_note, guardianRequired: row.guardian_required,
      createdAt: row.created_at, teacherResponseNote: row.teacher_response_note, respondedAt: row.responded_at,
      cancelledBy: row.cancelled_by, cancellationReason: row.cancellation_reason, cancelledAt: row.cancelled_at,
      completedAt: row.completed_at,
      teacherId: row.teacher_id, teacherName: row.teacher_name,
      subjectName: row.subject_name, category: row.category }));
  }

  async cancel(parentId: string, id: string): Promise<object> {
    return this.database.transaction(async (client) => {
      const booking = (await client.query<{ id: string; status: string; teacher_profile_id: string }>(
        `UPDATE bookings SET status='cancelled', cancelled_by='parent', cancelled_at=now(), updated_at=now()
         WHERE id=$1 AND parent_user_id=$2
           AND (status='requested' OR (status='confirmed' AND starts_at > now()))
         RETURNING id, status, teacher_profile_id`, [id, parentId],
      )).rows[0];
      if (!booking) {
        const existing = await client.query<{ status: string; starts_at: Date }>(
          "SELECT status, starts_at FROM bookings WHERE id=$1 AND parent_user_id=$2", [id, parentId],
        );
        if (!existing.rowCount) throw new NotFoundException("预约不存在");
        if (existing.rows[0].status === "confirmed" && existing.rows[0].starts_at.getTime() <= Date.now()) {
          throw new ConflictException("课程已开始，无法在线取消，请联系老师或平台");
        }
        throw new ConflictException("当前状态无法取消，请联系老师或平台");
      }
      await client.query(
        `INSERT INTO notifications (recipient_user_id, booking_id, type)
         SELECT user_id, $1, 'booking_cancelled' FROM teacher_profiles WHERE id=$2`,
        [id, booking.teacher_profile_id],
      );
      return { id: booking.id, status: booking.status };
    });
  }

  async forTeacher(teacherUserId: string): Promise<object[]> {
    const rows = await this.database.query<QueryResultRow>(
      `SELECT b.id, b.status, b.starts_at, b.duration_minutes, b.price_cents,
              b.child_age, b.meeting_area, b.request_note, b.guardian_required,
              b.teacher_response_note, b.created_at, b.responded_at,
              b.cancelled_by, b.cancellation_reason, b.cancelled_at, b.completed_at,
              u.phone AS parent_phone, s.name AS subject_name, s.category
       FROM bookings b JOIN teacher_profiles tp ON tp.id = b.teacher_profile_id
       JOIN users u ON u.id = b.parent_user_id
       JOIN teacher_subjects ts ON ts.id = b.teacher_subject_id
       JOIN subjects s ON s.id = ts.subject_id
       WHERE tp.user_id = $1
       ORDER BY (b.status = 'requested') DESC, (b.starts_at >= now()) DESC,
                CASE WHEN b.starts_at >= now() THEN b.starts_at END ASC,
                b.starts_at DESC LIMIT 100`, [teacherUserId],
    );
    return rows.map((row) => ({ id: row.id, status: row.status, startsAt: row.starts_at,
      durationMinutes: row.duration_minutes, priceCents: row.price_cents, childAge: row.child_age,
      meetingArea: row.meeting_area, note: row.request_note, guardianRequired: row.guardian_required,
      teacherResponseNote: row.teacher_response_note, createdAt: row.created_at, respondedAt: row.responded_at,
      cancelledBy: row.cancelled_by, cancellationReason: row.cancellation_reason, cancelledAt: row.cancelled_at,
      completedAt: row.completed_at,
      parentPhone: row.parent_phone, subjectName: row.subject_name, category: row.category }));
  }

  async teacherDecision(teacherUserId: string, id: string, decision: "confirmed" | "declined", note: string): Promise<object> {
    return this.database.transaction(async (client) => {
      const booking = (await client.query<TeacherBookingRow>(
        `SELECT b.id, b.status, b.starts_at, b.duration_minutes, b.teacher_profile_id,
                tp.status AS profile_status
         FROM bookings b JOIN teacher_profiles tp ON tp.id = b.teacher_profile_id
         WHERE b.id = $1 AND tp.user_id = $2 FOR UPDATE OF b`, [id, teacherUserId],
      )).rows[0];
      if (!booking) throw new NotFoundException("预约不存在");
      if (booking.status !== "requested") throw new ConflictException("该预约已处理或取消");
      if (booking.profile_status !== "active") throw new ConflictException("老师账号当前无法处理预约");
      if (decision === "confirmed") {
        if (booking.starts_at.getTime() <= Date.now()) throw new ConflictException("上课时间已过，请拒绝并请家长重新预约");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [booking.teacher_profile_id]);
        const conflict = await client.query(
          `SELECT 1 FROM bookings
           WHERE teacher_profile_id = $1 AND id <> $2 AND status = 'confirmed'
             AND starts_at < $3::timestamptz + make_interval(mins => $4)
             AND starts_at + make_interval(mins => duration_minutes) > $3::timestamptz
           LIMIT 1`, [booking.teacher_profile_id, id, booking.starts_at, booking.duration_minutes],
        );
        if (conflict.rowCount) throw new ConflictException("该时间段已有已确认课程");
      }
      const updated = (await client.query<{ id: string; status: string }>(
        `UPDATE bookings SET status=$2, teacher_response_note=$3, responded_at=now(), updated_at=now()
         WHERE id=$1 RETURNING id, status`, [id, decision, note || null],
      )).rows[0];
      await client.query(
        "INSERT INTO notifications (recipient_user_id, booking_id, type) SELECT parent_user_id, id, $2 FROM bookings WHERE id=$1",
        [id, decision === "confirmed" ? "booking_confirmed" : "booking_declined"],
      );
      return updated;
    });
  }

  async teacherCancel(teacherUserId: string, id: string, reason: string): Promise<object> {
    return this.database.transaction(async (client) => {
      const booking = (await client.query<{ id: string; status: string; parent_user_id: string }>(
        `UPDATE bookings b SET status='cancelled', cancelled_by='teacher', cancellation_reason=$3,
                cancelled_at=now(), updated_at=now()
         FROM teacher_profiles tp
         WHERE b.id=$1 AND tp.id=b.teacher_profile_id AND tp.user_id=$2
           AND b.status='confirmed' AND b.starts_at > now()
         RETURNING b.id, b.status, b.parent_user_id`, [id, teacherUserId, reason],
      )).rows[0];
      if (!booking) {
        const existing = await client.query<{ status: string; starts_at: Date }>(
          `SELECT b.status, b.starts_at FROM bookings b
           JOIN teacher_profiles tp ON tp.id=b.teacher_profile_id
           WHERE b.id=$1 AND tp.user_id=$2`, [id, teacherUserId],
        );
        if (!existing.rowCount) throw new NotFoundException("预约不存在");
        if (existing.rows[0].status === "confirmed" && existing.rows[0].starts_at.getTime() <= Date.now()) {
          throw new ConflictException("课程已开始，无法在线取消，请联系家长或平台");
        }
        throw new ConflictException("当前状态无法取消");
      }
      await client.query(
        "INSERT INTO notifications (recipient_user_id, booking_id, type) VALUES ($1,$2,'booking_teacher_cancelled')",
        [booking.parent_user_id, id],
      );
      return { id: booking.id, status: booking.status, cancelledBy: "teacher", cancellationReason: reason };
    });
  }

  async teacherComplete(teacherUserId: string, id: string): Promise<object> {
    return this.database.transaction(async (client) => {
      const booking = (await client.query<{ id: string; status: string; starts_at: Date; duration_minutes: number; parent_user_id: string }>(
        `SELECT b.id, b.status, b.starts_at, b.duration_minutes, b.parent_user_id
         FROM bookings b JOIN teacher_profiles tp ON tp.id=b.teacher_profile_id
         WHERE b.id=$1 AND tp.user_id=$2 FOR UPDATE OF b`, [id, teacherUserId],
      )).rows[0];
      if (!booking) throw new NotFoundException("预约不存在");
      if (booking.status !== "confirmed") throw new ConflictException("只有已确认的课程可以标记完成");
      if (booking.starts_at.getTime() + booking.duration_minutes * 60000 > Date.now()) {
        throw new ConflictException("课程结束后才能标记完成");
      }
      const result = (await client.query<{ id: string; status: string; completed_at: Date }>(
        "UPDATE bookings SET status='completed', completed_at=now(), updated_at=now() WHERE id=$1 RETURNING id, status, completed_at", [id],
      )).rows[0];
      await client.query(
        "INSERT INTO notifications (recipient_user_id, booking_id, type) VALUES ($1,$2,'booking_completed')",
        [booking.parent_user_id, id],
      );
      return { id: result.id, status: result.status, completedAt: result.completed_at };
    });
  }
}
