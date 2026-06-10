import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocx, extractTextFromPdf } from '@/lib/documentParser';
import { createClient } from '@/lib/supabase/server';

// Type definitions
interface LinterError {
  type: 'pronoun' | 'abbreviation' | 'citation' | 'system';
  message: string;
  line: number;
  context: string;
}

// Prohibited pronouns in Indonesian academic writing
const PROHIBITED_PRONOUNS = [
  { word: 'saya', message: "Kata ganti orang pertama tunggal 'saya' tidak diperbolehkan dalam penulisan ilmiah." },
  { word: 'kami', message: "Kata ganti orang pertama jamak 'kami' tidak diperbolehkan dalam penulisan ilmiah." },
  { word: 'penulis', message: "Penyebutan diri sendiri sebagai 'penulis' tidak diperbolehkan dalam naskah utama." },
  { word: 'penyusun', message: "Penyebutan diri sendiri sebagai 'penyusun' tidak diperbolehkan dalam naskah utama." },
  { word: 'kita', message: "Kata ganti 'kita' bersifat informal dan tidak boleh digunakan." },
  { word: 'anda', message: "Kata ganti orang kedua 'anda' tidak diperbolehkan." },
  { word: 'kamu', message: "Kata ganti informal 'kamu' tidak diperbolehkan." },
  { word: 'dia', message: "Penyebutan 'dia' harus dihindari, gunakan subjek formal atau pasif." }
];

// Prohibited abbreviations in Indonesian academic writing
const PROHIBITED_ABBREVIATIONS = [
  { abbrev: 'yg', replacement: 'yang' },
  { abbrev: 'dll', replacement: 'dan lain-lain' },
  { abbrev: 'dsb', replacement: 'dan sebagainya' },
  { abbrev: 'dgn', replacement: 'dengan' },
  { abbrev: 'utk', replacement: 'untuk' },
  { abbrev: 'sbg', replacement: 'sebagai' },
  { abbrev: 'dr', replacement: 'dari' }
];

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

    let text = '';
    const contentType = req.headers.get('content-type') || '';

    // Handle Multipart FormData (File Uploads)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json(
          { error: 'Berkas tidak ditemukan dalam unggahan.' },
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
      const filename = file.name.toLowerCase();

      if (filename.endsWith('.docx')) {
        text = extractTextFromDocx(buffer);
      } else if (filename.endsWith('.pdf')) {
        text = await extractTextFromPdf(buffer);
      } else if (filename.endsWith('.txt') || filename.endsWith('.md')) {
        text = buffer.toString('utf-8');
      } else {
        return NextResponse.json(
          { error: 'Format berkas tidak didukung. Gunakan .docx, .pdf, .txt, atau .md' },
          { status: 400 }
        );
      }
    } else {
      // Handle JSON Request (Direct Text API call)
      const body = await req.json();
      text = body.text || '';
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'Teks dokumen kosong atau gagal dibaca.' },
        { status: 400 }
      );
    }

    // Run the Linter
    const errors = runAcademicLinter(text);

    // Calculate metrics
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const charCount = text.length;
    const errorCount = errors.length;

    return NextResponse.json({
      valid: errorCount === 0,
      metrics: {
        wordCount,
        charCount,
        errorCount,
        citationCount: extractCitations(text).length
      },
      errors
    });
  } catch (error) {
    console.error('Audit API Error:', error);
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal pada server' },
      { status: 500 }
    );
  }
}

/**
 * Runs the academic guidelines linter on a document text
 */
function runAcademicLinter(text: string): LinterError[] {
  const errors: LinterError[] = [];
  const lines = text.split(/\r?\n/);

  // 1. Pronoun and Abbreviation Check line by line
  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    const trimmedLine = lineText.trim();
    if (!trimmedLine) return;

    // Skip table lines (lines containing multiple '|') to prevent false positives on headers like 'Penulis (Tahun)'
    const isTableLine = (trimmedLine.match(/\|/g) || []).length > 1;

    // Check prohibited pronouns
    if (!isTableLine) {
      for (const { word, message } of PROHIBITED_PRONOUNS) {
        // Word boundary regex that accounts for Indonesian/Latin characters
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(trimmedLine)) {
          errors.push({
            type: 'pronoun',
            message,
            line: lineNumber,
            context: getContextSnippet(trimmedLine, word)
          });
        }
      }
    }

    // Check prohibited abbreviations
    for (const { abbrev, replacement } of PROHIBITED_ABBREVIATIONS) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      if (regex.test(trimmedLine)) {
        errors.push({
          type: 'abbreviation',
          message: `Singkatan non-baku '${abbrev}' terdeteksi. Gunakan kata formal '${replacement}'.`,
          line: lineNumber,
          context: getContextSnippet(trimmedLine, abbrev)
        });
      }
    }
  });

  // 2. Citation and Bibliography Check
  const citations = extractCitations(text);
  const bibEntries = extractBibliographyEntries(text);

  if (citations.length > 0 || bibEntries.length > 0) {
    const bibNumbers = new Set(bibEntries.map(e => e.id));

    // Check 2.1: Cited item is missing in bibliography
    const uniqueCitedNumbers = Array.from(new Set(citations.map(c => c.id)));
    uniqueCitedNumbers.forEach(citedId => {
      if (!bibNumbers.has(citedId)) {
        // Find line where this citation occurred
        const citationOccurrences = citations.filter(c => c.id === citedId);
        citationOccurrences.forEach(occ => {
          errors.push({
            type: 'citation',
            message: `Kutipan [${citedId}] dirujuk dalam naskah, tetapi tidak ditemukan di Daftar Pustaka.`,
            line: occ.line,
            context: occ.context
          });
        });
      }
    });

    // Check 2.2: Bibliography item is never cited (Ghost Citation)
    const citedNumbersSet = new Set(citations.map(c => c.id));
    bibEntries.forEach(entry => {
      if (!citedNumbersSet.has(entry.id)) {
        errors.push({
          type: 'citation',
          message: `Referensi [${entry.id}] terdaftar di Daftar Pustaka, tetapi tidak pernah dirujuk dalam naskah utama.`,
          line: entry.line,
          context: entry.context
        });
      }
    });
  }

  return errors;
}

/**
 * Extracts all citations (e.g., [1], [2, 3]) from text along with context
 */
function extractCitations(text: string): { id: number; line: number; context: string }[] {
  const citations: { id: number; line: number; context: string }[] = [];
  const lines = text.split(/\r?\n/);
  const citationRegex = /\[([\d\s,\-]+)\]/g;

  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    let match;

    // Reset regex index for safety
    citationRegex.lastIndex = 0;

    while ((match = citationRegex.exec(lineText)) !== null) {
      const citationContent = match[1];
      const numbers = parseCitationNumbers(citationContent);
      
      numbers.forEach(num => {
        citations.push({
          id: num,
          line: lineNumber,
          context: getContextSnippet(lineText, match![0])
        });
      });
    }
  });

  return citations;
}

/**
 * Parses citation strings like "1", "1, 2", or "1-3" into an array of integers
 */
function parseCitationNumbers(citationStr: string): number[] {
  const result: number[] = [];
  const parts = citationStr.split(',');

  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const rangeParts = trimmed.split('-');
      if (rangeParts.length === 2) {
        const start = parseInt(rangeParts[0].trim(), 10);
        const end = parseInt(rangeParts[1].trim(), 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            result.push(i);
          }
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        result.push(num);
      }
    }
  });

  return result;
}

/**
 * Extracts defined items in the Daftar Pustaka section
 */
function extractBibliographyEntries(text: string): { id: number; line: number; context: string }[] {
  const entries: { id: number; line: number; context: string }[] = [];
  const lines = text.split(/\r?\n/);
  
  // Find where DAFTAR PUSTAKA begins
  let bibStartIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/daftar\s+pustaka/i.test(lines[i]) || /referensi/i.test(lines[i])) {
      bibStartIndex = i;
      break;
    }
  }

  if (bibStartIndex === -1) return [];

  // Parse lines in bibliography
  const entryRegex = /^\s*(?:\[(\d+)\]|(\d+)\.)\s+(.+)/;

  for (let i = bibStartIndex + 1; i < lines.length; i++) {
    const lineText = lines[i].trim();
    if (!lineText) continue;

    const match = entryRegex.exec(lineText);
    if (match) {
      const idStr = match[1] || match[2];
      const id = parseInt(idStr, 10);
      if (!isNaN(id)) {
        entries.push({
          id,
          line: i + 1,
          context: lineText.length > 60 ? lineText.substring(0, 60) + '...' : lineText
        });
      }
    }
  }

  return entries;
}

/**
 * Creates a short context snippet around the matched word
 */
function getContextSnippet(line: string, match: string): string {
  const index = line.toLowerCase().indexOf(match.toLowerCase());
  if (index === -1) return line;

  const start = Math.max(0, index - 20);
  const end = Math.min(line.length, index + match.length + 20);
  let snippet = line.substring(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < line.length) snippet = snippet + '...';

  return snippet.trim();
}
