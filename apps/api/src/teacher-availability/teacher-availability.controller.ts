import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Patch, Req } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { TeacherAvailabilityService } from "./teacher-availability.service";

@Controller("teacher-availability")
export class TeacherAvailabilityController {
  constructor(private readonly auth: AuthService, private readonly availability: TeacherAvailabilityService) {}

  @Get("me")
  async mine(@Req() request: Request): Promise<object> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    return this.availability.mine(user.id);
  }

  @Patch("me")
  async update(@Req() request: Request, @Headers("origin") origin: string | undefined, @Body() body: unknown): Promise<object> {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    if (!user.roles.includes("teacher")) throw new ForbiddenException("需要老师账号");
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).acceptingBookings !== "boolean") {
      throw new BadRequestException("接单状态无效");
    }
    return this.availability.update(user.id, (body as { acceptingBookings: boolean }).acceptingBookings);
  }
}
