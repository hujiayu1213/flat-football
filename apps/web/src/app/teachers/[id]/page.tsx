import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogRequestError, getCatalog, Teacher } from "@/lib/catalog";
import { BookingForm } from "@/components/booking-form";

export const dynamic = "force-dynamic";

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let teacher: Teacher;
  try {
    teacher = await getCatalog<Teacher>(`teachers/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof CatalogRequestError && error.status === 404) notFound();
    return <div className="page-wrap detail-page"><Link className="back-link" href="/teachers">← 返回老师列表</Link><p className="notice" role="status">老师资料暂时无法加载，请稍后再试。</p></div>;
  }

  return <div className="page-wrap detail-page">
    <Link className="back-link" href="/teachers">← 返回老师列表</Link>
    <div className="detail-card focused-detail-card"><div className="detail-avatar" aria-hidden="true">{teacher.displayName.slice(0, 1)}</div><div><p className="eyebrow">已审核大学生老师</p><h1>{teacher.displayName}</h1>
      <div className="teacher-service-badges">{teacher.offerings.some((item) => item.serviceKey === "flag_football") && <span className="flag-badge">腰旗训练</span>}{teacher.offerings.some((item) => item.serviceKey === "tutoring") && <span>学习辅导</span>}</div>
      <div className="detail-profile-facts"><p><strong>院校与学历</strong>{teacher.school} · {teacher.educationLevel}{teacher.grade && ` · ${teacher.grade}`}</p>{teacher.academicStrengths && <p><strong>擅长科目</strong>{teacher.academicStrengths}</p>}<p><strong>服务区域</strong>{teacher.serviceArea}</p></div>
      <p className="teacher-bio">{teacher.bio || "老师暂未填写简介"}</p>
    </div></div>
    {teacher.offerings.some((item) => item.serviceKey === "flag_football") && teacher.sportsExperience && <section className="coach-experience"><p className="eyebrow">腰旗经历</p><h2>训练背景</h2><p>{teacher.sportsExperience}</p></section>}
    <div className="section-intro detail-section-intro"><div><p className="eyebrow">预约服务</p><h2 className="section-title">选一项服务开始</h2></div>{teacher.offerings.some((item) => item.serviceKey === "tutoring") && <p>预约家教时，请写明希望辅导的科目与学习目标。</p>}</div>
    <div className="offering-grid">{teacher.offerings.map((offering) => <article className="offering-card" key={offering.id}>
      <p className="eyebrow">{offering.serviceKey === "flag_football" ? "运动支持 · 腰旗" : "学习支持 · 家教"}</p><h3>{offering.subjectName}</h3>
      <p className="offering-meta">{offering.durationMinutes} 分钟 <span>·</span> <strong>¥{offering.priceCents / 100}</strong>／次</p>
      {offering.serviceKey === "tutoring" && <p>擅长科目：{teacher.academicStrengths || "请在预约需求中说明目标科目"}</p>}
      {offering.venueRequirements && <p>场地与装备：{offering.venueRequirements}</p>}
      {offering.category === "sports" && <p>{offering.guardianRequired ? "需要家长在场" : "家长可与老师确认是否陪同"}</p>}
      <BookingForm offering={offering} />
    </article>)}</div>
  </div>;
}
