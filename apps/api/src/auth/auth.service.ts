import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";
import { SmsService } from "./sms.service";

interface ChallengeRow extends QueryResultRow {
  code_hash: string;
  expires_at: Date;
  sent_at: Date;
  window_started_at: Date;
  send_count: number;
  attempts: number;
  consumed_at: Date | null;
}

interface UserRow extends QueryResultRow {
  id: string;
  phone: string;
  status: string;
  roles: string[];
}

const sessionDays = 30;

@Injectable()
export class AuthService {
  private readonly otpSecret: string;

  constructor(private readonly database: DatabaseService, private readonly sms: SmsService) {
    const configured = process.env.OTP_SECRET;
    if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) {
      throw new Error("OTP_SECRET must contain at least 32 characters in production");
    }
    this.otpSecret = configured || randomBytes(32).toString("hex");
  }

  async sendCode(phone: string): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = this.hashCode(phone, code);
    await this.database.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [phone]);
      const result = await client.query<ChallengeRow>(
        "SELECT sent_at, window_started_at, send_count FROM login_challenges WHERE phone = $1 FOR UPDATE", [phone],
      );
      const previous = result.rows[0];
      const now = Date.now();
      if (previous && now - previous.sent_at.getTime() < 60_000) {
        throw new HttpException("请稍后再获取验证码", HttpStatus.TOO_MANY_REQUESTS);
      }
      const withinHour = previous && now - previous.window_started_at.getTime() < 3_600_000;
      if (withinHour && previous.send_count >= 5) {
        throw new HttpException("验证码发送过于频繁", HttpStatus.TOO_MANY_REQUESTS);
      }
      await client.query(
        `INSERT INTO login_challenges (phone, code_hash, expires_at, sent_at, window_started_at, send_count, attempts, consumed_at)
         VALUES ($1, $2, now() + interval '5 minutes', now(), now(), 1, 0, null)
         ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
           sent_at = now(), window_started_at = CASE WHEN login_challenges.window_started_at < now() - interval '1 hour' THEN now() ELSE login_challenges.window_started_at END,
           send_count = CASE WHEN login_challenges.window_started_at < now() - interval '1 hour' THEN 1 ELSE login_challenges.send_count + 1 END,
           attempts = 0, consumed_at = null`,
        [phone, codeHash],
      );
    });
    try {
      await this.sms.sendCode(phone, code);
    } catch (error) {
      await this.database.query("DELETE FROM login_challenges WHERE phone = $1 AND code_hash = $2", [phone, codeHash]);
      throw error;
    }
  }

  async verifyCode(phone: string, code: string): Promise<{ user: UserRow; token: string }> {
    const expected = this.hashCode(phone, code);
    const result = await this.database.transaction(async (client) => {
      const challenge = (await client.query<ChallengeRow>(
        "SELECT code_hash, expires_at, attempts, consumed_at FROM login_challenges WHERE phone = $1 FOR UPDATE", [phone],
      )).rows[0];
      if (!challenge || challenge.consumed_at || challenge.expires_at.getTime() < Date.now() || challenge.attempts >= 5) {
        return null;
      }
      const valid = timingSafeEqual(Buffer.from(challenge.code_hash, "hex"), Buffer.from(expected, "hex"));
      if (!valid) {
        await client.query("UPDATE login_challenges SET attempts = attempts + 1 WHERE phone = $1", [phone]);
        return null;
      }
      await client.query("UPDATE login_challenges SET consumed_at = now() WHERE phone = $1", [phone]);
      await client.query("INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING", [phone]);
      const user = (await client.query<UserRow>("SELECT id, phone, status FROM users WHERE phone = $1", [phone])).rows[0];
      if (user.status !== "active") return { suspended: true };
      await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'parent') ON CONFLICT DO NOTHING", [user.id]);
      const token = randomBytes(32).toString("base64url");
      await client.query(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 days')",
        [user.id, this.hashToken(token)],
      );
      const roles = (await client.query<{ role: string } & QueryResultRow>("SELECT role FROM user_roles WHERE user_id = $1", [user.id])).rows.map((row) => row.role);
      return { user: { ...user, roles }, token };
    });
    if (!result) throw new UnauthorizedException("验证码无效或已过期");
    if ("suspended" in result) throw new ForbiddenException("账号已停用");
    return result;
  }

  async currentUser(token: string | undefined): Promise<UserRow> {
    if (!token) throw new UnauthorizedException();
    const rows = await this.database.query<UserRow>(
      `SELECT u.id, u.phone, u.status, array_agg(r.role ORDER BY r.role) AS roles
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN user_roles r ON r.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'
       GROUP BY u.id`, [this.hashToken(token)],
    );
    if (!rows[0]) throw new UnauthorizedException();
    return rows[0];
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.database.query("DELETE FROM sessions WHERE token_hash = $1", [this.hashToken(token)]);
  }

  sessionToken(cookieHeader: string | undefined): string | undefined {
    const name = process.env.NODE_ENV === "production" ? "__Host-ct_session" : "ct_session";
    const entry = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return entry?.slice(name.length + 1);
  }

  sessionMaxAge(): number {
    return sessionDays * 24 * 60 * 60 * 1000;
  }

  private hashCode(phone: string, code: string): string {
    return createHmac("sha256", this.otpSecret).update(`${phone}:${code}`).digest("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
