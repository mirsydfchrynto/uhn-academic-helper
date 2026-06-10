import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { POST } from '../src/app/api/export/route';
import { NextRequest } from 'next/server';
import fs from 'fs';

async function testExportApiAll() {
  console.log("=== TESTING ALL EXPORT TYPES ===");

  const docTypes = ["proposal", "skripsi", "kpi"] as const;

  for (const docType of docTypes) {
    console.log(`\nTesting docType: ${docType}...`);
    const mockPayload = {
      docType: docType,
      nama: "M. IRSYAD FACHRYANTO",
      nim: "23090111",
      judul: `JUDUL UJI COBA EXPORT ${docType.toUpperCase()}`,
      companyName: docType === "kpi" ? "PT. TELKOM INDONESIA Tbk." : "",
      messages: [
        { role: "user", content: "Halo" },
        { role: "assistant", content: "Halo! Saya Asisten Akademik UHN. <DRAF>\nBAB 1\nPENDAHULUAN\n\n## 1.1 Latar Belakang\nPerkembangan teknologi sangat pesat.\n\n| No | Judul | Peneliti | Metode |\n|---|---|---|---|\n| 1 | Smart Queue | Irsyad | Hybrid FCFS |\n| 2 | QR Booking | Afriadi | REST API |\n\n</DRAF> Selesai." }
      ]
    };

    const req = new NextRequest("http://localhost:3000/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(mockPayload)
    });

    try {
      process.env.NEXT_PUBLIC_APP_ENV = 'test'; // Skip auth guard
      const res = await POST(req);
      console.log(`[${docType}] Response Status:`, res.status);
      
      if (res.status === 200) {
        const blob = await res.blob();
        console.log(`[${docType}] 🟢 Success: ${blob.size} bytes`);
      } else {
        const text = await res.text();
        console.error(`[${docType}] 🔴 Fail. Status: ${res.status}, Body: ${text}`);
      }
    } catch (err: any) {
      console.error(`[${docType}] 🔴 Crashed:`, err);
    }
  }

  console.log("\n=== ALL EXPORT TYPES TEST FINISHED ===");
}

testExportApiAll();
