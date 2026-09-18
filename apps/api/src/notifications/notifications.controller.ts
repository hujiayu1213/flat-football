import { Controller, ForbiddenException, Get, Headers, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly auth: AuthService, private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Req() request: Request): Promise<object> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return this.notifications.list(user.id);
  }

  @Get("unread-count")
  async unreadCount(@Req() request: Request): Promise<object> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return this.notifications.unreadCount(user.id);
  }

  @Post(":id/read")
  async read(@Req() request: Request, @Headers("origin") origin: string | undefined,
    @Param("id", new ParseUUIDPipe()) id: string): Promise<object> {
    this.checkOrigin(origin);
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return this.notifications.read(user.id, id);
  }

  @Post("read-all")
  async readAll(@Req() request: Request, @Headers("origin") origin: string | undefined): Promise<object> {
    this.checkOrigin(origin);
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return this.notifications.readAll(user.id);
  }

  private checkOrigin(origin: string | undefined): void {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("请求来源无效");
  }
}
