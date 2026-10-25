import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './product-styles.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Review · 自适应复习',
  description:
    '以知识点与能力掌握度为核心的多学科学习系统，支持课程复习、自适应练习、专项测试与学习分析。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="/fonts/noto-sc/font.css" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
