"use client";

import { useEffect, useState } from "react";
import styles from "./links.module.css";

export default function Links() {
  const [organizerHref, setOrganizerHref] = useState("/manage");

  useEffect(() => {
    const key = new URLSearchParams(window.location.hash.slice(1)).get("key");
    if (key) {
      setOrganizerHref(`/manage#${new URLSearchParams({ key }).toString()}`);
    }
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>ลงคะแนน · Live Vote</h1>
        <nav className={styles.links} aria-label="ลิงก์เว็บไซต์">
          <a className={styles.organizer} href={organizerHref}>เปิดหน้าผู้จัด</a>
          <a href="/">เปิดหน้าลงคะแนน</a>
        </nav>
        <p className={styles.note}>เก็บลิงก์ผู้จัดไว้ส่วนตัว</p>
      </main>
    </div>
  );
}
