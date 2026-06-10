const fs = require('fs');
const path = require('path');

// Prohibited pronouns in Indonesian academic writing
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

// Prohibited abbreviations
const PROHIBITED_ABBREVIATIONS = [
  { abbrev: 'yg', replacement: 'yang' },
  { abbrev: 'dll', replacement: 'dan lain-lain' },
  { abbrev: 'dsb', replacement: 'dan sebagainya' },
  { abbrev: 'dgn', replacement: 'dengan' },
  { abbrev: 'utk', replacement: 'untuk' },
  { abbrev: 'sbg', replacement: 'sebagai' },
  { abbrev: 'dr', replacement: 'dari' }
];

function runAcademicLinter(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);

  // 1. Pronoun and Abbreviation Check
  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    const trimmedLine = lineText.trim();
    if (!trimmedLine) return;

    // Skip table lines (lines containing multiple '|') to prevent false positives on headers like 'Penulis (Tahun)'
    const isTableLine = (trimmedLine.match(/\|/g) || []).length > 1;

    if (!isTableLine) {
      for (const { word, message } of PROHIBITED_PRONOUNS) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(trimmedLine)) {
          errors.push({
            type: 'PRONOUN',
            message,
            line: lineNumber,
            context: getContextSnippet(trimmedLine, word)
          });
        }
      }
    }

    for (const { abbrev, replacement } of PROHIBITED_ABBREVIATIONS) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      if (regex.test(trimmedLine)) {
        errors.push({
          type: 'ABBREVIATION',
          message: `Singkatan non-baku '${abbrev}' terdeteksi (Gunakan '${replacement}').`,
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
    const uniqueCitedNumbers = Array.from(new Set(citations.map(c => c.id)));

    uniqueCitedNumbers.forEach(citedId => {
      if (!bibNumbers.has(citedId)) {
        const citationOccurrences = citations.filter(c => c.id === citedId);
        citationOccurrences.forEach(occ => {
          errors.push({
            type: 'CITATION_MISSING',
            message: `Kutipan [${citedId}] dirujuk, tapi tidak ada di Daftar Pustaka.`,
            line: occ.line,
            context: occ.context
          });
        });
      }
    });

    const citedNumbersSet = new Set(citations.map(c => c.id));
    bibEntries.forEach(entry => {
      if (!citedNumbersSet.has(entry.id)) {
        errors.push({
          type: 'CITATION_UNUSED',
          message: `Referensi [${entry.id}] terdaftar di Daftar Pustaka, tapi tidak pernah dirujuk di naskah.`,
          line: entry.line,
          context: entry.context
        });
      }
    });
  }

  return errors;
}

function extractCitations(text) {
  const citations = [];
  const lines = text.split(/\r?\n/);
  const citationRegex = /\[([\d\s,\-]+)\]/g;

  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    let match;
    citationRegex.lastIndex = 0;
    while ((match = citationRegex.exec(lineText)) !== null) {
      const numbers = parseCitationNumbers(match[1]);
      numbers.forEach(num => {
        citations.push({
          id: num,
          line: lineNumber,
          context: getContextSnippet(lineText, match[0])
        });
      });
    }
  });
  return citations;
}

function parseCitationNumbers(citationStr) {
  const result = [];
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

// Main execution
const defaultDraftPath = '/home/irsyad/Gudang/mydevelopment/core/Draf_Tugas_Metopen_Irsyad_Lengkap.md';
const draftPath = process.argv[2] || defaultDraftPath;

if (fs.existsSync(draftPath)) {
  const text = fs.readFileSync(draftPath, 'utf8');
  console.log(`Auditing: ${draftPath}`);
  const errors = runAcademicLinter(text);
  console.log(`\nAudit Complete! Found ${errors.length} formatting errors:\n`);
  errors.forEach(err => {
    console.log(`[${err.type}] Line ${err.line}: ${err.message}`);
    console.log(`Context: "${err.context}"\n`);
  });
} else {
  console.error(`File not found: ${draftPath}`);
}
