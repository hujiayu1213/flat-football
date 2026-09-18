import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("send-code")
  async sendCode(@Body() body: unknown, @Headers("origin") origin?: string): Promise<{ sent: true }> {
    this.checkOrigin(origin);
    const phone = this.phoneFrom(body);
    await this.auth.sendCode(phone);
    return { sent: true };
  }

  @Post("verify-code")
  async verifyCode(@Body() body: unknown, @Headers("origin") origin: string | undefined, @Res({ passthrough: true }) response: Response): Promise<{ user: { id: string; phone: string; roles: string[] } }> {
    this.checkOrigin(origin);
    const phone = this.phoneFrom(body);
    const code = this.codeFrom(body);
    const { user, token } = await this.auth.verifyCode(phone, code);
    response.cookie(this.cookieName(), token, this.cookieOptions());
    return { user: { id: user.id, phone: user.phone, roles: user.roles } };
  }

  @Get("me")
  async me(@Req() request: Request): Promise<{ id: string; phone: string; roles: string[] }> {
    const user = await this.auth.currentUser(this.auth.sessionToken(request.headers.cookie));
    return { id: user.id, phone: user.phone, roles: user.roles };
  }

  @Post("logout")
  async logout(@Req() request: Request, @Headers("origin") origin: string | undefined, @Res({ passthrough: true }) response: Response): Promise<{ ok: true }> {
    this.checkOrigin(origin);
    await this.auth.logout(this.auth.sessionToken(request.headers.cookie));
    response.clearCookie(this.cookieName(), this.cookieOptions());
    return { ok: true };
  }

  private phoneFrom(body: unknown): string {
    const phone = this.field(body, "phone");
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new BadRequestException("请输入有效的中国大陆手机号");
    return phone;
  }

  private codeFrom(body: unknown): string {
    const code = this.field(body, "code");
    if (!/^\d{6}$/.test(code)) throw new BadRequestException("请输入 6 位验证码");
    return code;
  }

  private field(body: unknown, name: string): string {
    if (!body || typeof body !== "object" || !(name in body)) throw new BadRequestException("请求参数不完整");
    const value = (body as Record<string, unknown>)[name];
    if (typeof value !== "string") throw new BadRequestException("请求参数无效");
    return value;
  }

  private checkOrigin(origin: string | undefined): void {
    if (origin && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) {
      throw new ForbiddenException("请求来源无效");
    }
  }

  private cookieName(): string {
    return process.env.NODE_ENV === "production" ? "__Host-ct_session" : "ct_session";
  }

  private cookieOptions(): { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number } {
    return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: this.auth.sessionMaxAge() };
  }

}
