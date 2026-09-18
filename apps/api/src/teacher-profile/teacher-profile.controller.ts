import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Post, Req, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { TeacherProfileService } from "./teacher-profile.service";
import { parseOfferings } from "../teacher-application/teacher-application.types";

@Controller("teacher-profile")
export class TeacherProfileController {
  constructor(private readonly auth: AuthService, private readonly profile: TeacherProfileService) {}

  @Get("me")
  async mine(@Req() request: Request): Promise<object> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    return this.profile.mine(user.id);
  }

  @Post("change")
  async change(@Req() request: Request, @Headers("origin") origin: string | undefined, @Body() body: unknown): Promise<object> {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    if (!body || typeof body !== "object") throw new BadRequestException("资料修改无效");
    const data = body as Record<string, unknown>;
    if (typeof data.serviceArea !== "string" || typeof data.bio !== "string") throw new BadRequestException("资料修改无效");
    const serviceArea = data.serviceArea.trim();
    const bio = data.bio.trim();
    if (serviceArea.length < 2 || serviceArea.length > 120) throw new BadRequestException("服务区域应为 2 到 120 字");
    if (bio.length < 10 || bio.length > 1000) throw new BadRequestException("个人介绍应为 10 到 1000 字");
    return this.profile.submit(user.id, { serviceArea, bio });
  }

  @Get("offerings/me")
  async myOfferings(@Req() request: Request): Promise<object> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    return this.profile.myOfferings(user.id);
  }

  @Post("offerings/change")
  @UseInterceptors(FileFieldsInterceptor([{ name: "sportsProof", maxCount: 1 }],
    { limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 1, fieldSize: 20_000 } }))
  async changeOfferings(@Req() request: Request, @Headers("origin") origin: string | undefined,
    @Body() body: Record<string, unknown>, @UploadedFiles() files: { sportsProof?: Express.Multer.File[] }): Promise<object> {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    if (typeof body?.change !== "string" || body.change.length > 20_000) throw new BadRequestException("课程修改资料无效");
    let parsed: unknown;
    try { parsed = JSON.parse(body.change); } catch { throw new BadRequestException("课程修改资料格式无效"); }
    if (!parsed || typeof parsed !== "object") throw new BadRequestException("课程修改资料格式无效");
    const data = parsed as Record<string, unknown>;
    if (typeof data.sportsExperience !== "string" || data.sportsExperience.trim().length > 1000) {
      throw new BadRequestException("运动经历无效");
    }
    if (typeof data.academicStrengths !== "string" || data.academicStrengths.trim().length > 240) {
      throw new BadRequestException("擅长科目无效");
    }
    return this.profile.submitOfferings(user.id, { offerings: parseOfferings(data.offerings),
      sportsExperience: data.sportsExperience.trim(), academicStrengths: data.academicStrengths.trim() }, files?.sportsProof?.[0]);
  }
}
