import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './product-styles.css';

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
        <link id="review-cjk-fallback" rel="stylesheet" href="/fonts/noto-sc/font.css" media="print" />
        <link rel="stylesheet" href="/fonts/reviewbox/font.css?v=fangyuan-1000" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
