import { NextRequest, NextResponse } from 'next/server';
import { humanizeAcademicText } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    // === AUTHENTICATION GUARD ===
    const isTest = process.env.APP_ENV === 'test';
    let user = null;
    if (!isTest) {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      user = data?.user;
      if (!user) {
        return NextResponse.json({ error: "Unauthorized / Wajib Login" }, { status: 401 });
      }
    }
    // ============================

    const body = await req.json();
    const { text, model } = body;
    
    // API Key: ONLY use server-side environment variable.
    // Never accept API key from client body for security reasons.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'Teks dokumen kosong atau tidak valid.' },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key Gemini tidak dikonfigurasi di server. Hubungi administrator.' },
        { status: 500 }
      );
    }

    // Process humanization
    const result = await humanizeAcademicText(text, apiKey, model || 'gemini-2.5-pro');

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Gagal memproses tulisan dengan AI.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      text: result.text
    });
  } catch (error) {
    console.error('Humanize API Error:', error);
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal pada server.' },
      { status: 500 }
    );
  }
}
