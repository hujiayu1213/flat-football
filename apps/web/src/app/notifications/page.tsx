"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Notification {
  id: string; type: string; bookingId: string | null; verificationId: string | null;
  verificationType: string | null; createdAt: string; readAt: string | null;
  subjectName: string | null; teacherName: string | null;
}
interface NotificationResponse { unreadCount: number; items: Notification[] }
const labels: Record<string, (item: Notification) => string> = {
  booking_requested: (item) => `收到新的${item.subjectName}预约请求`,
  booking_cancelled: (item) => `${item.subjectName}预约请求已由家长取消`,
  booking_confirmed: (item) => `${item.teacherName}已确认${item.subjectName}预约`,
  booking_declined: (item) => `${item.teacherName}未接受${item.subjectName}预约`,
  booking_teacher_cancelled: (item) => `${item.teacherName}取消了已确认的${item.subjectName}课程`,
  booking_completed: (item) => `${item.teacherName}已将${item.subjectName}课程标记为完成`,
  verification_approved: (item) => item.verificationType === "profile_change" ? "公开资料修改已通过审核" : item.verificationType === "qualification_change" ? "课程调整已通过审核" : "老师入驻审核已通过",
  verification_changes_requested: (item) => item.verificationType === "profile_change" ? "公开资料修改需要补充" : item.verificationType === "qualification_change" ? "课程调整需要补充资料" : "老师入驻申请需要补充资料",
  verification_rejected: (item) => item.verificationType === "profile_change" ? "公开资料修改未通过审核" : item.verificationType === "qualification_change" ? "课程调整未通过审核" : "老师入驻申请未通过审核",
};
function destination(item: Notification): string {
  if (item.verificationId) return item.verificationType === "profile_change" ? "/teacher-profile" : item.verificationType === "qualification_change" ? "/teacher-offerings" : "/teach";
  return item.type === "booking_requested" || item.type === "booking_cancelled" ? "/teacher-bookings" : "/bookings";
}

export default function NotificationsPage() {
  const [data, setData] = useState<NotificationResponse>({ unreadCount: 0, items: [] });
  const [view, setView] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/notifications", { credentials: "same-origin" });
        if (response.status === 401) { setView("login"); return; }
        if (!response.ok) throw new Error();
        setData(await response.json() as NotificationResponse);
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
  }, []);

  async function markRead(id: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      setData((current) => ({ unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item) }));
      window.dispatchEvent(new Event("notifications-changed"));
    } catch { setMessage("标记已读失败，请稍后重试"); }
    finally { setBusy(false); }
  }

  async function markAllRead() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      setData((current) => ({ unreadCount: 0,
        items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) }));
      window.dispatchEvent(new Event("notifications-changed"));
    } catch { setMessage("标记已读失败，请稍后重试"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap notifications-page">
    <div className="page-heading"><p className="eyebrow">消息中心</p><h1>站内通知</h1><p>预约消息和老师资料审核结果会显示在这里。</p></div>
    {view === "loading" && <p className="notice">正在加载通知…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/login">登录</Link> 查看通知。</p>}
    {view === "error" && <p className="notice" role="alert">通知暂时无法加载，请稍后重试。</p>}
    {message && <p className="notice" role="alert">{message}</p>}
    {view === "ready" && <>
      <div className="notifications-toolbar"><span>未读 {data.unreadCount} 条</span>{data.unreadCount > 0 && <button type="button" disabled={busy} onClick={() => void markAllRead()}>全部标为已读</button>}</div>
      {data.items.length ? <div className="notification-list">{data.items.map((item) => <article key={item.id} className={item.readAt ? "notification-item" : "notification-item unread"}>
        <div><strong>{labels[item.type]?.(item) ?? "状态有更新"}</strong><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div>
        <div className="notification-actions"><Link href={destination(item)}>{item.verificationId ? "查看审核结果" : "查看预约"}</Link>{!item.readAt && <button type="button" disabled={busy} onClick={() => void markRead(item.id)}>标为已读</button>}</div>
      </article>)}</div> : <p className="notice">暂无通知。</p>}
    </>}
  </div>;
}
