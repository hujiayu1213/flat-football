"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function LoginForm({ adminMode = false, teacherMode = false }: { adminMode?: boolean; teacherMode?: boolean }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  async function submit(path: string, payload: object) {
    const response = await fetch(`/api/auth/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(typeof data.message === "string" ? data.message : "操作失败，请稍后再试");
    }
    return response;
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await submit("send-code", { phone }); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "发送失败"); }
    finally { setBusy(false); }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await submit("verify-code", { phone, code });
      const result = await response.json() as { user: { roles: string[] } };
      setIsAdmin(result.user.roles.includes("admin"));
      setIsTeacher(result.user.roles.includes("teacher"));
      setLoggedIn(true);
      window.dispatchEvent(new Event("auth-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap login-page"><div className="login-card">
    <p className="eyebrow">{adminMode ? "平台管理" : teacherMode ? "大学生老师" : "家长与大学生老师"}</p>
    <h1>{adminMode ? "管理员登录" : teacherMode ? "老师登录／入驻" : "手机号登录"}</h1>
    {loggedIn ? <div className="login-success">
      <p>登录成功。</p>
      {adminMode && !isAdmin ? <p className="form-error" role="alert">当前手机号尚未开通管理员权限。请由项目维护者授权后重新登录。</p> :
        <Link className="button button-primary" href={adminMode ? "/admin" : teacherMode && isTeacher ? "/teacher-bookings" : "/teach"}>
          {adminMode ? "进入管理后台" : teacherMode && isTeacher ? "查看老师预约" : "查看老师入驻"}
        </Link>}
    </div> : <>
      <p className="login-description">{adminMode
        ? "使用已开通管理员权限的手机号登录，审核老师身份、服务和价格。"
        : teacherMode ? "使用手机号登录。首次登录后可填写入驻资料；已通过审核的老师可管理预约。"
        : "首次验证手机号时会自动创建账号。"}</p>
      <form onSubmit={sent ? verifyCode : sendCode}>
        <label>手机号<input type="tel" inputMode="numeric" autoComplete="tel" value={phone}
          onChange={(event) => { setPhone(event.target.value); setSent(false); setCode(""); }}
          pattern="1[3-9][0-9]{9}" required maxLength={11} placeholder="中国大陆手机号" /></label>
        {sent && <label>短信验证码<input type="text" inputMode="numeric" autoComplete="one-time-code"
          value={code} onChange={(event) => setCode(event.target.value)}
          pattern="[0-9]{6}" required maxLength={6} placeholder="6 位验证码" /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "请稍候…" : sent ? "登录" : "获取验证码"}</button>
      </form>
      {sent && <button className="text-button" type="button" onClick={() => setSent(false)}>重新获取验证码</button>}
      <p className="login-note">验证码 5 分钟内有效。请勿向他人透露验证码。</p>
    </>}
  </div></div>;
}
