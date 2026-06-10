import { NextRequest, NextResponse } from "next/server";
import { extractTextFromDocx, extractTextFromPdf } from "@/lib/documentParser";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // === AUTHENTICATION GUARD ===`
    const isTest = process.env.APP_ENV === 'test';
    let user = null;
    if (isTest) {
      user = { email: "test@example.com" };
    } else {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      user = data?.user;
      if (!user) {
        return NextResponse.json({ error: "Unauthorized / Wajib Login" }, { status: 401 });
      }
    }
    // ============================

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type harus berupa multipart/form-data." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Tidak ada berkas yang diunggah." },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Ukuran file melebihi batas maksimal 10MB." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase();
    let text = "";

    if (ext === "docx") {
      text = extractTextFromDocx(buffer);
    } else if (ext === "pdf") {
      text = await extractTextFromPdf(buffer);
    } else if (ext === "txt" || ext === "md") {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: `Format berkas '.${ext}' tidak didukung. Harap gunakan berkas .docx, .pdf, .txt, atau .md.` },
        { status: 400 }
      );
    }

    // Sanitize output (e.g. limit character size to prevent overloading context, approx 30k characters)
    const maxLength = 30000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + "\n\n... [Draf berkas terlalu panjang dan dipotong otomatis oleh sistem]";
    }

    return NextResponse.json({
      name: file.name,
      text: text.trim()
    });
  } catch (error: any) {
    console.error("Parse File Error:", error);
    return NextResponse.json(
      { error: error.message || "Gagal mengekstrak teks dari berkas." },
      { status: 500 }
    );
  }
}
