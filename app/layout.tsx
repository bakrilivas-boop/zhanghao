import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "账号管理 · 库存与销售记录",
  description: "手机与电脑共用的账号库存，轻松导入、标记销售状态和导出交付。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
