"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

interface ProfileChange { status: string; reviewNote: string | null; proposed: { serviceArea: string; bio: string } }
interface ProfileState {
  profileId: string; displayName: string; serviceArea: string; bio: string;
  latestChange: ProfileChange | null;
}

export default function TeacherProfilePage() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [view, setView] = useState<"loading" | "login" | "unavailable" | "ready" | "error">("loading");
  const [serviceArea, setServiceArea] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/teacher-profile/me", { credentials: "same-origin" });
        if (response.status === 401) { setView("login"); return; }
        if (response.status === 403 || response.status === 409) { setView("unavailable"); return; }
        if (!response.ok) throw new Error();
        const data = await response.json() as ProfileState;
        setProfile(data);
        setServiceArea(data.latestChange?.status === "changes_requested" || data.latestChange?.status === "rejected" ? data.latestChange.proposed.serviceArea : data.serviceArea);
        setBio(data.latestChange?.status === "changes_requested" || data.latestChange?.status === "rejected" ? data.latestChange.proposed.bio : data.bio);
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/teacher-profile/change", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceArea, bio }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof data.message === "string" ? data.message : "提交失败，请稍后重试");
      }
      setProfile((current) => current ? { ...current, latestChange: { status: "submitted", reviewNote: null, proposed: { serviceArea: serviceArea.trim(), bio: bio.trim() } } } : current);
      setMessage("修改申请已提交，等待管理员审核");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "提交失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap teacher-settings-page">
    <div className="page-heading"><p className="eyebrow">老师中心</p><h1>公开资料修改</h1><p>修改服务区域和个人介绍，管理员审核通过后才更新公开页面。</p></div>
    {view === "loading" && <p className="notice">正在读取老师资料…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/login">登录</Link> 修改资料。</p>}
    {view === "unavailable" && <p className="notice">通过审核的老师可提交资料修改。<Link href="/teach">查看入驻状态</Link></p>}
    {view === "error" && <p className="notice" role="alert">老师资料暂时无法加载，请稍后重试。</p>}
    {view === "ready" && profile && <section className="teacher-settings-card profile-change-card">
      <h2>{profile.displayName}</h2>
      <p className="form-hint">当前公开资料：{profile.serviceArea} · {profile.bio}</p>
      {profile.latestChange?.status === "submitted" && <p className="notice" role="status">修改申请正在审核。拟更新区域：{profile.latestChange.proposed.serviceArea}</p>}
      {(profile.latestChange?.status === "changes_requested" || profile.latestChange?.status === "rejected") && <p className="review-note" role="status">上次审核反馈：{profile.latestChange.reviewNote}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {profile.latestChange?.status !== "submitted" && <form onSubmit={(event) => void submit(event)}>
        <label>服务区域<input required minLength={2} maxLength={120} value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder="例如：海淀区中关村" /></label>
        <label>个人介绍<textarea required minLength={10} maxLength={1000} rows={5} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
        <p className="form-hint">课程项目、价格、学校和认证信息不在本次修改范围内。</p>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "提交中…" : "提交审核"}</button>
      </form>}
    </section>}
  </div>;
}
