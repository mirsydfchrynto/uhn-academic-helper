#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const Pizzip = require('pizzip');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Core academic rules
const PROHIBITED_PRONOUNS = [
  { word: 'saya', message: "Kata ganti orang pertama tunggal 'saya' tidak diperbolehkan." },
  { word: 'kami', message: "Kata ganti orang pertama jamak 'kami' tidak diperbolehkan." },
  { word: 'penulis', message: "Penyebutan diri sendiri sebagai 'penulis' tidak diperbolehkan." },
  { word: 'penyusun', message: "Penyebutan diri sendiri sebagai 'penyusun' tidak diperbolehkan." },
  { word: 'kita', message: "Kata ganti 'kita' bersifat informal." },
  { word: 'anda', message: "Kata ganti orang kedua 'anda' tidak diperbolehkan." },
  { word: 'kamu', message: "Kata ganti informal 'kamu' tidak diperbolehkan." },
  { word: 'dia', message: "Penyebutan 'dia' harus dihindari." }
];

const PROHIBITED_ABBREVIATIONS = [
  { abbrev: 'yg', replacement: 'yang' },
  { abbrev: 'dll', replacement: 'dan lain-lain' },
  { abbrev: 'dsb', replacement: 'dan sebagainya' },
  { abbrev: 'dgn', replacement: 'dengan' },
  { abbrev: 'utk', replacement: 'untuk' },
  { abbrev: 'sbg', replacement: 'sebagai' },
  { abbrev: 'dr', replacement: 'dari' }
];

const HUMANIZER_SYSTEM_INSTRUCTION = `
Anda adalah asisten akademik ahli untuk mahasiswa Universitas Harkat Negeri (Sekolah Vokasi).
Tugas Anda adalah memparafrase dan meng-humanize naskah akademik (seperti draf proposal skripsi, skripsi, atau laporan KPI) dalam Bahasa Indonesia agar terasa natural, mengalir, dan lolos dari detektor AI (seperti Turnitin atau GPTZero) dengan akurasi 100% manusiawi.

Patuhi aturan ketat berikut saat menulis ulang teks:
1. GAYA BAHASA & TATA BAHASA: Gunakan Bahasa Indonesia baku (EBI/PUEBI), kalimat pasif formal, hindari kata ganti orang pertama/kedua ("saya", "kami", "penulis", "penyusun").
2. BURSTINESS: Variasikan panjang kalimat secara dinamis (kalimat pendek 5-10 kata dicampur kalimat panjang 20-30 kata).
3. PERPLEXITY: Hindari kata klise AI ("Penting untuk dicatat", "Seiring perkembangan teknologi", "Selain itu" di awal kalimat berulang kali).
4. KETAHANAN DATA & SITASI: JANGAN mengubah kutipan format IEEE (misal [1], [2-4]). JANGAN mengubah data teknis, nama instansi, nama algoritma, lokasi, atau harga.
5. FORMAT OUTPUT: Kembalikan HANYA teks hasil parafrase tanpa intro/outro apa pun.
`;

// Helper: Extract Text from DOCX
function extractTextFromDocx(buffer) {
  try {
    const zip = new Pizzip(buffer);
    const docXml = zip.file('word/document.xml')?.asText();
    if (!docXml) return '';
    const matches = docXml.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
    return matches
      .map(match => {
        const text = match.replace(/<[^>]+>/g, '');
        return text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      })
      .join(' ');
  } catch (error) {
    throw new Error('Gagal membaca DOCX: ' + error.message);
  }
}

// Helper: Extract Text from PDF
async function extractTextFromPdf(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    throw new Error('Gagal membaca PDF: ' + error.message);
  }
}

// Helper: Context Snippet
function getContextSnippet(line, match) {
  const index = line.toLowerCase().indexOf(match.toLowerCase());
  if (index === -1) return line;
  const start = Math.max(0, index - 20);
  const end = Math.min(line.length, index + match.length + 20);
  let snippet = line.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < line.length) snippet = snippet + '...';
  return snippet.trim();
}

// Helper: Parse Citations
function extractCitations(text) {
  const citations = [];
  const lines = text.split(/\r?\n/);
  const citationRegex = /\[([\d\s,\-]+)\]/g;

  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    let match;
    citationRegex.lastIndex = 0;
    while ((match = citationRegex.exec(lineText)) !== null) {
      const parts = match[1].split(',');
      parts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed.includes('-')) {
          const range = trimmed.split('-');
          if (range.length === 2) {
            const start = parseInt(range[0].trim(), 10);
            const end = parseInt(range[1].trim(), 10);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
              for (let i = start; i <= end; i++) {
                citations.push({ id: i, line: lineNumber, context: getContextSnippet(lineText, match[0]) });
              }
            }
          }
        } else {
          const num = parseInt(trimmed, 10);
          if (!isNaN(num)) {
            citations.push({ id: num, line: lineNumber, context: getContextSnippet(lineText, match[0]) });
          }
        }
      });
    }
  });
  return citations;
}

// Helper: Parse Bibliography
function extractBibliographyEntries(text) {
  const entries = [];
  const lines = text.split(/\r?\n/);
  let bibStartIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/daftar\s+pustaka/i.test(lines[i]) || /referensi/i.test(lines[i])) {
      bibStartIndex = i;
      break;
    }
  }
  if (bibStartIndex === -1) return [];

  const entryRegex = /^\s*(?:\[(\d+)\]|(\d+)\.)\s+(.+)/;
  for (let i = bibStartIndex + 1; i < lines.length; i++) {
    const lineText = lines[i].trim();
    if (!lineText) continue;
    const match = entryRegex.exec(lineText);
    if (match) {
      const id = parseInt(match[1] || match[2], 10);
      if (!isNaN(id)) {
        entries.push({ id, line: i + 1, context: lineText });
      }
    }
  }
  return entries;
}

// Core Linter Engine
function runAcademicLinter(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    const trimmedLine = lineText.trim();
    if (!trimmedLine) return;

    // Ignore tables
    const isTableLine = (trimmedLine.match(/\|/g) || []).length > 1;

    if (!isTableLine) {
      for (const { word, message } of PROHIBITED_PRONOUNS) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(trimmedLine)) {
          errors.push({ type: 'pronoun', message, line: lineNumber, context: getContextSnippet(trimmedLine, word) });
        }
      }
    }

    for (const { abbrev, replacement } of PROHIBITED_ABBREVIATIONS) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      if (regex.test(trimmedLine)) {
        errors.push({ type: 'abbreviation', message: `Singkatan non-baku '${abbrev}' terdeteksi. Gunakan '${replacement}'.`, line: lineNumber, context: getContextSnippet(trimmedLine, abbrev) });
      }
    }
  });

  const citations = extractCitations(text);
  const bibEntries = extractBibliographyEntries(text);

  if (citations.length > 0 || bibEntries.length > 0) {
    const bibNumbers = new Set(bibEntries.map(e => e.id));
    const uniqueCitedNumbers = Array.from(new Set(citations.map(c => c.id)));

    uniqueCitedNumbers.forEach(citedId => {
      if (!bibNumbers.has(citedId)) {
        const citationOccurrences = citations.filter(c => c.id === citedId);
        citationOccurrences.forEach(occ => {
          errors.push({ type: 'citation', message: `Kutipan [${citedId}] dirujuk, tapi tidak ada di Daftar Pustaka.`, line: occ.line, context: occ.context });
        });
      }
    });

    const citedNumbersSet = new Set(citations.map(c => c.id));
    bibEntries.forEach(entry => {
      if (!citedNumbersSet.has(entry.id)) {
        errors.push({ type: 'citation', message: `Referensi [${entry.id}] terdaftar di Daftar Pustaka, tapi tidak pernah dirujuk di naskah.`, line: entry.line, context: entry.context });
      }
    });
  }

  return errors;
}

// Read text from various file formats
async function readTextFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Berkas tidak ditemukan: ${filePath}`);
  }
  
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.docx') {
    return extractTextFromDocx(buffer);
  } else if (ext === '.pdf') {
    return await extractTextFromPdf(buffer);
  } else {
    return buffer.toString('utf8');
  }
}

// JSON-RPC input/output handler via stdin/stdout
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    
    // Handle JSON-RPC method calls
    if (request.method === 'initialize') {
      sendResponse(request.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'uhn-academic-helper', version: '1.0.0' }
      });
    } else if (request.method === 'tools/list') {
      sendResponse(request.id, {
        tools: [
          {
            name: 'audit_uhn_document',
            description: 'Audit naskah akademik (.txt, .md, .docx, .pdf) terhadap aturan penulisan resmi Sekolah Vokasi Universitas Harkat Negeri (UHN). Memeriksa kata ganti terlarang, singkatan non-baku, dan keselarasan kutipan IEEE.',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: { type: 'string', description: 'Path absolut berkas dokumen yang ingin di-audit.' }
              },
              required: ['filePath']
            }
          },
          {
            name: 'humanize_uhn_document',
            description: 'Mengubah dan memparafrase teks akademik AI agar lolos detektor AI (seperti Turnitin/GPTZero) dengan gaya penulisan manusiawi formal mahasiswa UHN. Mengamankan sitasi IEEE dan parameter data.',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: { type: 'string', description: 'Path absolut berkas dokumen yang ingin di-humanize.' },
                geminiApiKey: { type: 'string', description: 'Optional Gemini API Key. Jika dikosongkan, akan menggunakan variabel lingkungan GEMINI_API_KEY.' }
              },
              required: ['filePath']
            }
          }
        ]
      });
    } else if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      
      if (name === 'audit_uhn_document') {
        try {
          const text = await readTextFromFile(args.filePath);
          const errors = runAcademicLinter(text);
          
          let responseText = `Hasil Audit Dokumen: ${path.basename(args.filePath)}\n`;
          responseText += `Total Kata: ${text.split(/\s+/).length}\n`;
          responseText += `Total Eror Format: ${errors.length}\n\n`;
          
          if (errors.length === 0) {
            responseText += '✅ Dokumen memenuhi semua pedoman format penulisan akademik UHN! (0 eror).';
          } else {
            errors.forEach((err, idx) => {
              responseText += `${idx + 1}. [Line ${err.line}] [Type: ${err.type.toUpperCase()}] ${err.message}\n`;
              responseText += `   Konteks: "${err.context}"\n\n`;
            });
          }

          sendResponse(request.id, {
            content: [{ type: 'text', text: responseText }]
          });
        } catch (err) {
          sendResponse(request.id, {
            content: [{ type: 'text', text: `Gagal memproses audit: ${err.message}` }]
          }, true);
        }
      } else if (name === 'humanize_uhn_document') {
        try {
          const apiKey = args.geminiApiKey || process.env.GEMINI_API_KEY;
          if (!apiKey) {
            throw new Error('API Key Gemini tidak ditemukan. Harap berikan API Key Gemini.');
          }

          const text = await readTextFromFile(args.filePath);
          console.error(`Mengirim draf ${path.basename(args.filePath)} ke Gemini API...`);

          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({
            model: 'gemini-3.1-flash-lite',
            systemInstruction: HUMANIZER_SYSTEM_INSTRUCTION
          });

          // Process in chunks if extremely long, for now process first 5000 chars as test
          const processText = text.length > 5000 ? text.substring(0, 5000) + '...' : text;

          const prompt = `Humanize teks akademik berikut:\n\n${processText}`;
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, topP: 0.9 }
          });

          const responseText = result.response.text();
          
          sendResponse(request.id, {
            content: [{ type: 'text', text: responseText.trim() }]
          });
        } catch (err) {
          sendResponse(request.id, {
            content: [{ type: 'text', text: `Gagal menjalankan humanizer: ${err.message}` }]
          }, true);
        }
      } else {
        sendResponse(request.id, {
          code: -32601,
          message: `Method not found: ${name}`
        }, true);
      }
    }
  } catch (err) {
    // Ignore invalid JSON lines
  }
});

function sendResponse(id, result, isError = false) {
  const response = {
    jsonrpc: '2.0',
    id
  };
  
  if (isError) {
    response.error = result;
  } else {
    response.result = result;
  }
  
  process.stdout.write(JSON.stringify(response) + '\n');
}
