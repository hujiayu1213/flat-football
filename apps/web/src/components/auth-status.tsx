"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CurrentUser { phone: string; roles: string[] }

export function AuthStatus() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    function load() {
      fetch("/api/auth/me", { credentials: "same-origin", signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<CurrentUser> : null)
        .then((value) => setUser(value))
        .catch(() => undefined);
    }
    load();
    window.addEventListener("auth-changed", load);
    return () => { controller.abort(); window.removeEventListener("auth-changed", load); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/notifications/unread-count", { credentials: "same-origin" });
        if (response.ok) {
          const data = await response.json() as { unreadCount: number };
          if (active) setUnreadCount(data.unreadCount);
        }
      } catch { /* Count is optional in the navigation. */ }
    }
    function onVisible() { if (document.visibilityState === "visible") void refresh(); }
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    window.addEventListener("notifications-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("notifications-changed", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [user]);

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (response.ok) { setUser(null); setUnreadCount(0); }
  }

  return user ? <span className="auth-status"><Link href="/notifications">通知{unreadCount > 0 ? `（${unreadCount}）` : ""}</Link>{user.roles.includes("teacher") && <><Link href="/teacher-bookings">老师预约</Link><Link href="/teacher-settings">接单设置</Link><Link href="/teacher-profile">修改资料</Link><Link href="/teacher-offerings">调整课程</Link></>}{user.roles.includes("admin") && <><Link href="/admin">老师审核</Link><Link href="/admin/subjects">服务管理</Link></>}<span>{user.phone.slice(0, 3)}****{user.phone.slice(-4)}</span><button type="button" onClick={logout}>退出</button></span> : <Link href="/login">登录／注册</Link>;
}
