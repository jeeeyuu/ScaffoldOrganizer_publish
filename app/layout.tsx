import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ScaffoldOrganizer 2.0",
  description: "Task, session, and worklog operating app migrated to Next.js and Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
