import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Post, Req, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { TeacherApplicationService } from "./teacher-application.service";
import { parseApplication } from "./teacher-application.types";

@Controller("teacher-application")
export class TeacherApplicationController {
  constructor(private readonly auth: AuthService, private readonly applications: TeacherApplicationService) {}

  @Get("me")
  async mine(@Req() request: Request): Promise<object> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return this.applications.mine(user.id);
  }

  @Post()
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: "studentProof", maxCount: 1 }, { name: "sportsProof", maxCount: 1 }],
    { limits: { files: 2, fileSize: 5 * 1024 * 1024, fields: 1, fieldSize: 20_000 } },
  ))
  async submit(
    @Req() request: Request,
    @Headers("origin") origin: string | undefined,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: { studentProof?: Express.Multer.File[]; sportsProof?: Express.Multer.File[] },
  ): Promise<object> {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!files?.studentProof?.[0]) throw new BadRequestException("请上传在校证明图片");
    const input = parseApplication(body?.application);
    return this.applications.submit(user.id, input, files.studentProof[0], files.sportsProof?.[0]);
  }
}
