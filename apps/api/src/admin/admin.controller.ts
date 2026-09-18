import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { AdminService } from "./admin.service";
import { AdminSubjectsService } from "./admin-subjects.service";

@Controller("admin")
export class AdminController {
  constructor(private readonly auth: AuthService, private readonly admin: AdminService,
    private readonly subjects: AdminSubjectsService) {}

  @Get("subjects")
  async subjectsList(@Req() request: Request): Promise<object[]> {
    await this.requireAdmin(request);
    return this.subjects.list();
  }

  @Post("subjects")
  async createSubject(@Req() request: Request, @Headers("origin") origin: string | undefined,
    @Body() body: unknown): Promise<object> {
    this.checkOrigin(origin);
    await this.requireAdmin(request);
    if (!body || typeof body !== "object") throw new BadRequestException("教学项目信息无效");
    const data = body as Record<string, unknown>;
    if (typeof data.name !== "string") throw new BadRequestException("教学项目名称无效");
    const name = data.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 100) throw new BadRequestException("教学项目名称应为 2 到 100 字");
    if (data.category !== "academic" && data.category !== "sports") throw new BadRequestException("教学项目分类无效");
    const sortOrder = data.sortOrder === undefined ? 0 : data.sortOrder;
    if (!Number.isInteger(sortOrder) || (sortOrder as number) < -10000 || (sortOrder as number) > 10000) {
      throw new BadRequestException("排序值应为 -10000 到 10000 的整数");
    }
    return this.subjects.create({ name, category: data.category, sortOrder: sortOrder as number });
  }

  @Patch("subjects/:id/status")
  async subjectStatus(@Req() request: Request, @Headers("origin") origin: string | undefined,
    @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown): Promise<object> {
    this.checkOrigin(origin);
    await this.requireAdmin(request);
    if (!body || typeof body !== "object") throw new BadRequestException("教学项目状态无效");
    const status = (body as Record<string, unknown>).status;
    if (status !== "active" && status !== "hidden") throw new BadRequestException("教学项目状态无效");
    return this.subjects.setStatus(id, status);
  }

  @Get("verifications")
  async list(@Req() request: Request, @Query("status") status?: string,
    @Query("type") type?: string): Promise<object[]> {
    await this.requireAdmin(request);
    const selected = status ?? "submitted";
    if (!["submitted", "approved", "changes_requested", "rejected"].includes(selected)) throw new BadRequestException("审核状态无效");
    if (type && !["initial", "profile_change", "qualification_change"].includes(type)) {
      throw new BadRequestException("申请类型无效");
    }
    return this.admin.list(selected, type);
  }

  @Get("verifications/:id")
  async detail(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string): Promise<object> {
    await this.requireAdmin(request);
    return this.admin.detail(id);
  }

  @Get("verifications/:id/files/:fileId")
  async proof(
    @Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string,
    @Param("fileId", new ParseUUIDPipe()) fileId: string, @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    await this.requireAdmin(request);
    const file = await this.admin.proof(id, fileId);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", "inline; filename=proof");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(file.bytes);
  }

  @Post("verifications/:id/decision")
  async decide(
    @Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("origin") origin: string | undefined, @Body() body: unknown,
  ): Promise<{ status: "approved" | "changes_requested" | "rejected" }> {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
    const user = await this.requireAdmin(request);
    if (!body || typeof body !== "object") throw new BadRequestException("审核决定无效");
    const data = body as Record<string, unknown>;
    if (data.decision !== "approved" && data.decision !== "changes_requested" && data.decision !== "rejected") {
      throw new BadRequestException("审核决定无效");
    }
    if (data.note !== undefined && typeof data.note !== "string") throw new BadRequestException("审核备注无效");
    const note = String(data.note ?? "").trim();
    if (note.length > 1000 || (data.decision !== "approved" && !note)) throw new BadRequestException("退回或拒绝时必须填写原因（最多 1000 字）");
    return this.admin.decide(id, user.id, data.decision, note);
  }

  private async requireAdmin(request: Request): Promise<{ id: string }> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("admin")) throw new ForbiddenException("需要管理员权限");
    return user;
  }

  private checkOrigin(origin: string | undefined): void {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
  }
}
