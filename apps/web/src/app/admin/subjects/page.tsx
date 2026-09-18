"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ManagedSubject {
  id: string; name: string; category: "academic" | "sports";
  status: "active" | "hidden"; sortOrder: number; teacherCount: number;
}

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<ManagedSubject[]>([]);
  const [view, setView] = useState<"loading" | "unauthorized" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/subjects", { credentials: "same-origin" });
        if (response.status === 401 || response.status === 403) { setView("unauthorized"); return; }
        if (!response.ok) throw new Error();
        setSubjects(await response.json() as ManagedSubject[]);
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
  }, []);

  async function toggle(subject: ManagedSubject) {
    const status = subject.status === "active" ? "hidden" : "active";
    if (status === "hidden" && !window.confirm(`下架“${subject.name}”后，家长将无法选择该项目。确定继续吗？`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/subjects/${subject.id}/status`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("状态更新失败，请刷新后重试");
      setSubjects((current) => current.map((item) => item.id === subject.id ? { ...item, status } : item));
      setMessage(status === "active" ? "教学项目已重新上架" : "教学项目已下架");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "状态更新失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap admin-page">
    <Link className="back-link" href="/admin">← 返回老师审核</Link>
    <div className="page-heading"><p className="eyebrow">管理后台</p><h1>服务管理</h1><p>平台目前开放腰旗橄榄球和学科家教两项服务。下架服务不会删除已有预约。</p></div>
    {view === "loading" && <p className="notice">正在加载教学项目…</p>}
    {view === "unauthorized" && <p className="notice" role="alert">此页面需要管理员账号。</p>}
    {view === "error" && <p className="notice" role="alert">教学项目暂时无法加载。</p>}
    {view === "ready" && <>
      {message && <p className="notice" role="status">{message}</p>}
      <div className="subject-management-list">{subjects.map((subject) => <article className="subject-management-item" key={subject.id}>
        <div><strong>{subject.name}</strong><span>{subject.category === "sports" ? "腰旗训练" : "大学生家教"} · 当前 {subject.teacherCount} 位老师</span></div>
        <div><span className={subject.status === "active" ? "subject-state active" : "subject-state"}>{subject.status === "active" ? "已上架" : "已下架"}</span>
          <button type="button" disabled={busy} onClick={() => void toggle(subject)}>{subject.status === "active" ? "下架" : "重新上架"}</button></div>
      </article>)}</div>
    </>}
  </div>;
}
