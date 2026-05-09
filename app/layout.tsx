import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Scaffold Organizer",
  description: "Task, schedule, and worklog operating app migrated to Next.js and Supabase.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "256x256" }],
    shortcut: [{ url: "/favicon.png", type: "image/png", sizes: "256x256" }],
    apple: [{ url: "/favicon.png", type: "image/png", sizes: "256x256" }],
  },
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
