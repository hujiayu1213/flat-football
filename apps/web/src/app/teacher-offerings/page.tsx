"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Subject } from "@/lib/catalog";

interface OfferingForm {
  subjectId: string; priceYuan: string; durationMinutes: string; ageRange: string;
  venueRequirements: string; guardianRequired: boolean;
}
interface OfferingData {
  subjectId: string; subjectName: string; category: "academic" | "sports"; subjectStatus: string;
  priceCents: number; durationMinutes: number; ageRange: string;
  venueRequirements: string; guardianRequired: boolean;
}
interface LatestChange {
  status: string; reviewNote: string | null;
  proposed: { offerings: Array<Omit<OfferingData, "subjectName" | "category" | "subjectStatus">>;
    sportsExperience: string; academicStrengths: string };
}
interface ResponseData { displayName: string; sportsExperience: string; academicStrengths: string;
  offerings: OfferingData[]; latestChange: LatestChange | null }
const blank = (): OfferingForm => ({ subjectId: "", priceYuan: "", durationMinutes: "60", ageRange: "", venueRequirements: "", guardianRequired: false });
function toForm(item: { subjectId: string; priceCents: number; durationMinutes: number; ageRange: string; venueRequirements: string; guardianRequired: boolean }): OfferingForm {
  return { subjectId: item.subjectId, priceYuan: String(item.priceCents / 100), durationMinutes: String(item.durationMinutes),
    ageRange: item.ageRange, venueRequirements: item.venueRequirements ?? "", guardianRequired: item.guardianRequired };
}

export default function TeacherOfferingsPage() {
  const [view, setView] = useState<"loading" | "login" | "unavailable" | "ready" | "error">("loading");
  const [data, setData] = useState<ResponseData | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [offerings, setOfferings] = useState<OfferingForm[]>([blank()]);
  const [sportsExperience, setSportsExperience] = useState("");
  const [academicStrengths, setAcademicStrengths] = useState("");
  const [sportsProof, setSportsProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [profileResponse, subjectsResponse] = await Promise.all([
          fetch("/api/teacher-profile/offerings/me", { credentials: "same-origin" }), fetch("/api/subjects"),
        ]);
        if (profileResponse.status === 401) { setView("login"); return; }
        if (profileResponse.status === 403 || profileResponse.status === 409) { setView("unavailable"); return; }
        if (!profileResponse.ok || !subjectsResponse.ok) throw new Error();
        const result = await profileResponse.json() as ResponseData;
        setData(result);
        setSubjects(await subjectsResponse.json() as Subject[]);
        const proposal = result.latestChange?.status === "changes_requested" || result.latestChange?.status === "rejected"
          ? result.latestChange.proposed : null;
        setOfferings((proposal?.offerings ?? result.offerings).map(toForm));
        setSportsExperience(proposal?.sportsExperience ?? result.sportsExperience);
        setAcademicStrengths(proposal?.academicStrengths ?? result.academicStrengths);
        setView("ready");
      } catch { setView("error"); }
    }
    void load();
  }, []);

  function update(index: number, patch: Partial<OfferingForm>) {
    setOfferings((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }
  const hasSports = offerings.some((item) => subjects.some((subject) => subject.id === item.subjectId && subject.category === "sports"));
  const hasAcademic = offerings.some((item) => subjects.some((subject) => subject.id === item.subjectId && subject.service_key === "tutoring"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const body = new FormData();
    body.append("change", JSON.stringify({ sportsExperience, academicStrengths, offerings: offerings.map((item) => ({
      subjectId: item.subjectId, priceCents: Math.round(Number(item.priceYuan) * 100),
      durationMinutes: Number(item.durationMinutes), ageRange: item.ageRange,
      venueRequirements: item.venueRequirements, guardianRequired: item.guardianRequired,
    })) }));
    if (hasSports && sportsProof) body.append("sportsProof", sportsProof);
    try {
      const response = await fetch("/api/teacher-profile/offerings/change", { method: "POST", credentials: "same-origin", body });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(typeof result.message === "string" ? result.message : "提交失败，请稍后重试");
      }
      setData((current) => current ? { ...current, latestChange: { status: "submitted", reviewNote: null,
        proposed: { sportsExperience, academicStrengths, offerings: offerings.map((item) => ({ subjectId: item.subjectId,
          priceCents: Math.round(Number(item.priceYuan) * 100), durationMinutes: Number(item.durationMinutes),
          ageRange: item.ageRange, venueRequirements: item.venueRequirements, guardianRequired: item.guardianRequired })) } } } : current);
      setMessage("课程调整申请已提交，等待管理员审核");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "提交失败"); }
    finally { setBusy(false); }
  }

  return <div className="page-wrap application-page">
    <div className="page-heading"><p className="eyebrow">老师中心</p><h1>调整服务与擅长方向</h1><p>调整腰旗或家教服务、价格和擅长科目须经管理员审核；已有预约保留原价格和时长。</p></div>
    {view === "loading" && <p className="notice">正在读取课程资料…</p>}
    {view === "login" && <p className="notice">请先 <Link href="/login">登录</Link>。</p>}
    {view === "unavailable" && <p className="notice">通过审核的老师可调整课程。<Link href="/teach">查看入驻状态</Link></p>}
    {view === "error" && <p className="notice" role="alert">课程资料暂时无法加载，请稍后重试。</p>}
    {view === "ready" && data && <>
      <p className="form-hint">老师：{data.displayName} · 当前可约课程 {data.offerings.length} 门</p>
      {data.latestChange?.status === "submitted" && <p className="notice" role="status">课程调整正在审核，请等待结果。</p>}
      {(data.latestChange?.status === "changes_requested" || data.latestChange?.status === "rejected") && <p className="review-note" role="status">上次审核反馈：{data.latestChange.reviewNote}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {data.latestChange?.status !== "submitted" && <form className="application-form" onSubmit={(event) => void submit(event)}>
        <section className="form-section"><h2>拟公开的服务</h2><p className="form-hint">请选择腰旗橄榄球或学科家教。移除服务不会删除历史预约。</p>
          {offerings.map((item, index) => {
            const subject = subjects.find((entry) => entry.id === item.subjectId);
            const sports = subject?.category === "sports";
            return <div className="offering-form" key={index}><div className="form-grid">
              <label>服务类型<select required value={item.subjectId} onChange={(event) => update(index, { subjectId: event.target.value })}>
                <option value="">请选择</option>{subjects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                {!subject && item.subjectId && <option value={item.subjectId} disabled>{data.offerings.find((entry) => entry.subjectId === item.subjectId)?.subjectName ?? "已下架项目"}（已下架，请移除）</option>}
              </select></label>
              <label>单次价格（元）<input required type="number" min={10} max={2000} step="0.01" value={item.priceYuan} onChange={(event) => update(index, { priceYuan: event.target.value })} /></label>
              <label>单次时长（分钟）<input required type="number" min={30} max={180} value={item.durationMinutes} onChange={(event) => update(index, { durationMinutes: event.target.value })} /></label>
              <label>适合年龄段<input maxLength={60} value={item.ageRange} onChange={(event) => update(index, { ageRange: event.target.value })} /></label>
              {sports && <><label className="wide">场地与装备要求<textarea required maxLength={500} rows={2} value={item.venueRequirements} onChange={(event) => update(index, { venueRequirements: event.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={item.guardianRequired} onChange={(event) => update(index, { guardianRequired: event.target.checked })} />要求家长在场</label></>}
            </div>{offerings.length > 1 && <button className="text-button" type="button" onClick={() => setOfferings((current) => current.filter((_, position) => position !== index))}>移除项目</button>}</div>;
          })}
          {offerings.length < 2 && <button className="button button-secondary" type="button" onClick={() => setOfferings((current) => [...current, blank()])}>再添加一种服务</button>}
        </section>
        {hasAcademic && <section className="form-section"><h2>家教擅长科目</h2>
          <label>擅长科目和适合年级<input required minLength={2} maxLength={240} value={academicStrengths} onChange={(event) => setAcademicStrengths(event.target.value)} placeholder="例如：初中数学、英语阅读" /></label>
        </section>}
        {hasSports && <section className="form-section"><h2>体育教学资料</h2>
          <label>运动与教学经历<textarea required minLength={10} maxLength={1000} rows={3} value={sportsExperience} onChange={(event) => setSportsExperience(event.target.value)} /></label>
          <label>补充体育资质证明（如有，JPG／PNG，5MB 以内）<input type="file" accept="image/jpeg,image/png" onChange={(event) => setSportsProof(event.target.files?.[0] ?? null)} /></label>
        </section>}
        <button className="button button-primary submit-application" type="submit" disabled={busy}>{busy ? "提交中…" : "提交审核"}</button>
      </form>}
    </>}
  </div>;
}
