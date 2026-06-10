import Pizzip from 'pizzip';
import { VertexAI } from '@google-cloud/vertexai';

/**
 * Extracts plain text from a .docx file buffer.
 * Handles basic paragraphs, tables, headers, and footers.
 */
export function extractTextFromDocx(buffer: Buffer): string {
  try {
    const zip = new Pizzip(buffer);
    const docXml = zip.file('word/document.xml')?.asText();
    if (!docXml) return '';

    // Extract text from tables as well
    const extractTextRuns = (xml: string): string[] => {
      const paragraphMatches = xml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g) || [];
      return paragraphMatches.map((pXml) => {
        const tMatches = pXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
        const text = tMatches
          .map((tMatch) => {
            const rawText = tMatch.replace(/<[^>]+>/g, '');
            return rawText
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'");
          })
          .join('');
        return text;
      });
    };

    const paragraphsText = extractTextRuns(docXml);

    // Also try to extract from headers/footers
    const headerFiles = ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'];
    const footerFiles = ['word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml'];
    const extraParts: string[] = [];

    for (const hf of [...headerFiles, ...footerFiles]) {
      const xml = zip.file(hf)?.asText();
      if (xml) {
        extraParts.push(...extractTextRuns(xml));
      }
    }

    const allText = [...extraParts, ...paragraphsText]
      .filter((p) => p.trim().length > 0)
      .join('\n\n');

    return allText;
  } catch (error) {
    console.error('Error parsing docx:', error);
    throw new Error('Gagal mengekstrak teks dari berkas DOCX');
  }
}

/**
 * Performs Multimodal OCR using Gemini 2.5 Flash on scanned documents.
 */
async function performGeminiOcr(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_REGION || 'us-central1';

  if (!project) {
    console.warn('[OCR] GCP_PROJECT_ID is not configured. Skipping Gemini OCR.');
    return '';
  }

  try {
    const vertexAI = new VertexAI({ project, location });
    const model = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        'Anda adalah mesin pembaca dokumen (OCR) ahli. Ekstrak seluruh teks dari dokumen lampiran ini secara lengkap. Pertahankan tata letak, judul, poin-poin, dan baris tabel. Jangan berikan komentar, penjelasan, kata pengantar, atau penutup. Berikan hanya teks naskah aslinya saja.',
    });

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: buffer.toString('base64'),
                mimeType,
              },
            },
            {
              text: 'Ekstrak teks akademik dari dokumen berikut secara penuh:',
            },
          ],
        },
      ],
    });

    const text =
      response.response.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : '';
  } catch (error) {
    console.error('[OCR] Gemini Multimodal OCR Error:', error);
    return '';
  }
}

/**
 * Extracts plain text from a .pdf file buffer.
 * Uses pdf-parse with scanned PDF fallback via Gemini OCR.
 * Uses dynamic import() instead of eval('require') to avoid bundler issues.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid Next.js client-side bundling issues
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    const text = data?.text || '';

    // If the PDF returns very little or empty text, it is likely a scan. Trigger Gemini OCR.
    if (text.trim().replace(/\s/g, '').length < 50) {
      console.log(
        '[PARSER] Teks PDF kosong/sangat pendek. Menjalankan Gemini Multimodal OCR...'
      );
      const ocrText = await performGeminiOcr(buffer, 'application/pdf');
      if (ocrText) return ocrText;
    }
    return text;
  } catch (error) {
    console.error('Error parsing pdf:', error);
    // Fallback: if pdf-parse crashes (common for corrupted or scanned PDFs), try Gemini OCR directly
    console.log(
      '[PARSER] pdf-parse gagal. Mencoba menjalankan Gemini Multimodal OCR secara langsung...'
    );
    try {
      const ocrText = await performGeminiOcr(buffer, 'application/pdf');
      if (ocrText) return ocrText;
    } catch (ocrErr) {
      console.error('[PARSER] Gemini OCR gagal juga:', ocrErr);
    }
    throw new Error('Gagal mengekstrak teks dari berkas PDF');
  }
}
