import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Live Vote · ลงคะแนน",
  description: "ตั้งคะแนนสูงสุดและเวลาได้เอง ดูคะแนนเฉลี่ยและจำนวนผู้ลงคะแนนแบบสด โดยไม่เก็บชื่อหรือคะแนนรายคน",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body className="antialiased">{children}</body></html>;
}
