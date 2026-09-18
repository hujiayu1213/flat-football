import type { Metadata } from "next";
import Link from "next/link";
import { AuthStatus } from "@/components/auth-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "腰旗与家教",
  description: "为热爱体育的孩子寻找腰旗训练和学习辅导，让运动与学习一起向前。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link className="brand" href="/" aria-label="腰旗与家教首页">
              <span className="brand-mark">腰</span>
              <span>腰旗与家教</span>
            </Link>
            <nav aria-label="主导航" className="site-nav">
              <Link href="/">首页</Link>
              <Link href="/teachers">找老师</Link>
              <Link href="/bookings">我的预约</Link>
              <Link href="/teach">成为老师</Link>
              <Link href="/teacher/login">老师登录</Link>
              <AuthStatus />
            </nav>
          </header>
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <span>腰旗与家教</span>
            <span>热爱运动，学习也能跟上</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
