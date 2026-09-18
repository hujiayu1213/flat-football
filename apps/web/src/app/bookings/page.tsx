"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Booking {
  id: string; status: string; startsAt: string; durationMinutes: number; priceCents: number;
  childAge: number; meetingArea: string; note: string; guardianRequired: boolean;
  teacherId: string; teacherName: string; subjectName: string; category: string;
  teacherResponseNote: string | null;
  cancelledBy: "parent" | "teacher" | null; cancellationReason: string | null;
  completedAt: string | null;
}
const statusText: Record<string, string> = {
  requested: "等待老师确认", confirmed: "已确认", declined: "老师未接受", cancelled: "已取消", completed: "已完成",
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [view, setView] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/bookings/mine", { credentials: "same-origin" });
        if (response.status === 401) { setView("login"); return; }
        if (!response.ok) throw new Error();
        setBookings(await response.json() as Booking[]);
        setNow(Date.now());
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function cancel(id: string, confirmed: boolean) {
    if (confirmed && !window.confirm("确定取消这门已确认的课程吗？老师会收到通知。")) return;
    setBusyId(id); setMessage("");
    try {
      const response = await fetch(`/api/bookings/${id}/cancel`, { method: "POST", credentials: "same-origin" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof data.message === "string" ? data.message : "取消失败，请刷新后重试");
      }
      setBookings((current) => current.map((item) => item.id === id ? { ...item, status: "cancelled", cancelledBy: "parent" } : item));
      setMessage("预约已取消，老师将收到站内通知");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "取消失败"); }
    finally { setBusyId(""); }
  }

  return <div className="page-wrap bookings-page">
    <div className="page-heading"><p className="eyebrow">家长中心</p><h1>我的预约</h1><p>查看已提交的课程请求和处理状态。</p></div>
    {view === "loading" && <p className="notice">正在加载预约…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/login">登录</Link> 查看预约。</p>}
    {view === "error" && <p className="notice" role="alert">预约暂时无法加载，请稍后重试。</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {view === "ready" && (bookings.length ? <div className="booking-list">{bookings.map((booking) => <article className="booking-card" key={booking.id}>
      <div className="booking-card-top"><h2>{booking.subjectName} · {booking.teacherName}</h2><span>{booking.status === "cancelled" && booking.cancelledBy === "teacher" ? "老师已取消" : statusText[booking.status] ?? booking.status}</span></div>
      <p>希望上课：{new Date(booking.startsAt).toLocaleString("zh-CN")} · {booking.durationMinutes} 分钟</p>
      <p>¥{booking.priceCents / 100}／次 · 学生 {booking.childAge} 岁 · {booking.meetingArea}</p>
      {booking.guardianRequired && <p>需家长在场</p>}
      {booking.note && <p>备注：{booking.note}</p>}
      {booking.teacherResponseNote && <p>老师回复：{booking.teacherResponseNote}</p>}
      {booking.cancellationReason && <p>取消原因：{booking.cancellationReason}</p>}
      {booking.completedAt && <p>老师标记完成：{new Date(booking.completedAt).toLocaleString("zh-CN")}</p>}
      <div className="booking-card-actions"><Link href={`/teachers/${booking.teacherId}`}>查看老师</Link>{(booking.status === "requested" || (booking.status === "confirmed" && new Date(booking.startsAt).getTime() > now)) && <button type="button" disabled={busyId === booking.id} onClick={() => void cancel(booking.id, booking.status === "confirmed")}>取消预约</button>}</div>
    </article>)}</div> : <p className="notice">还没有预约。<Link href="/teachers">去找老师</Link></p>)}
  </div>;
}
