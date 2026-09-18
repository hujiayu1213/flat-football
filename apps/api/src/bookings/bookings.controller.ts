import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, ForbiddenException } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "./bookings.service";

@Controller("bookings")
export class BookingsController {
  constructor(private readonly auth: AuthService, private readonly bookings: BookingsService) {}

  @Get("mine")
  async mine(@Req() request: Request): Promise<object[]> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return this.bookings.mine(user.id);
  }

  @Get("teacher")
  async teacher(@Req() request: Request): Promise<object[]> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    return this.bookings.forTeacher(user.id);
  }

  @Post()
  async create(@Req() request: Request, @Headers("origin") origin: string | undefined, @Body() body: unknown): Promise<object> {
    this.checkOrigin(origin);
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("parent")) throw new ForbiddenException("需要家长账号");
    if (!body || typeof body !== "object") throw new BadRequestException("预约信息无效");
    const data = body as Record<string, unknown>;
    const offeringId = this.string(data, "offeringId", 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offeringId)) {
      throw new BadRequestException("教学项目无效");
    }
    const startsAt = this.string(data, "startsAt", 40);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(startsAt)) throw new BadRequestException("上课时间无效");
    const timestamp = new Date(startsAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp < Date.now() + 60 * 60 * 1000 || timestamp > Date.now() + 90 * 86400000) {
      throw new BadRequestException("请选择至少一小时后、九十天内的上课时间");
    }
    const childAge = data.childAge;
    if (!Number.isInteger(childAge) || (childAge as number) < 3 || (childAge as number) > 25) throw new BadRequestException("学生年龄无效");
    const meetingArea = this.string(data, "meetingArea", 120).trim();
    if (meetingArea.length < 2) throw new BadRequestException("请填写上课区域");
    const note = data.note === undefined ? "" : this.string(data, "note", 500).trim();
    return this.bookings.create(user.id, { offeringId, startsAt, childAge: childAge as number, meetingArea, note });
  }

  @Post(":id/cancel")
  async cancel(@Req() request: Request, @Headers("origin") origin: string | undefined, @Param("id", new ParseUUIDPipe()) id: string): Promise<object> {
    this.checkOrigin(origin);
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return this.bookings.cancel(user.id, id);
  }

  @Post(":id/teacher-decision")
  async teacherDecision(
    @Req() request: Request, @Headers("origin") origin: string | undefined,
    @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown,
  ): Promise<object> {
    this.checkOrigin(origin);
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    if (!body || typeof body !== "object") throw new BadRequestException("处理结果无效");
    const data = body as Record<string, unknown>;
    if (data.decision !== "confirmed" && data.decision !== "declined") throw new BadRequestException("处理结果无效");
    if (data.note !== undefined && typeof data.note !== "string") throw new BadRequestException("回复内容无效");
    const note = String(data.note ?? "").trim();
    if (note.length > 500 || (data.decision === "declined" && !note)) throw new BadRequestException("拒绝时请填写原因（最多 500 字）");
    return this.bookings.teacherDecision(user.id, id, data.decision, note);
  }

  @Post(":id/teacher-cancel")
  async teacherCancel(
    @Req() request: Request, @Headers("origin") origin: string | undefined,
    @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown,
  ): Promise<object> {
    this.checkOrigin(origin);
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).reason !== "string") {
      throw new BadRequestException("请填写取消原因");
    }
    const reason = (body as { reason: string }).reason.trim();
    if (reason.length < 2 || reason.length > 500) throw new BadRequestException("取消原因应为 2 到 500 字");
    return this.bookings.teacherCancel(user.id, id, reason);
  }

  @Post(":id/teacher-complete")
  async teacherComplete(@Req() request: Request, @Headers("origin") origin: string | undefined,
    @Param("id", new ParseUUIDPipe()) id: string): Promise<object> {
    this.checkOrigin(origin);
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    return this.bookings.teacherComplete(user.id, id);
  }

  private string(data: Record<string, unknown>, key: string, max: number): string {
    const value = data[key];
    if (typeof value !== "string" || !value || value.length > max) throw new BadRequestException(`${key} 无效`);
    return value;
  }

  private checkOrigin(origin: string | undefined): void {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
  }
}
