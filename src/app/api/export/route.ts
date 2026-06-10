import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Table, TableRow, TableCell, WidthType, Header, Footer, PageNumber } from "docx";
import fs from "fs";
import path from "path";
import pizzip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@/lib/supabase/server";
import { mergeXmlNamespaces } from "@/lib/documentGenerator";

// Helper: parse inline markdown bold (**text**) and italic (*text*)
function parseInlineMarkdown(text: string, options?: { size?: number; align?: any }): TextRun[] {
  const baseSize = options?.size || 24; // 12pt default
  // Split on **bold** and *italic* patterns
  const parts = text.split(/(\*\*[\s\S]*?\*\*|\*[^*][\s\S]*?\*)/g);
  return parts.filter(p => p !== "").map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return new TextRun({ text: part.slice(2, -2), bold: true, font: "Times New Roman", size: baseSize });
    } else if (part.startsWith("*") && part.endsWith("*")) {
      return new TextRun({ text: part.slice(1, -1), italics: true, font: "Times New Roman", size: baseSize });
    }
    return new TextRun({ text: part, font: "Times New Roman", size: baseSize });
  });
}

// Helper to parse markdown table row to array of cells
function parseMarkdownTableRow(line: string): string[] {
  // Remove starting and ending pipes and split by |
  const content = line.trim().replace(/^\||\|$/g, "");
  return content.split("|").map(cell => cell.trim());
}

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

    const { messages, docType, nama, nim, judul, companyName } = await req.json();
    
    // Extract accumulated assistant workspace drafts
    let accumulatedDraft = "";
    
    // 1. Try to find content inside <DRAF>...</DRAF>
    messages.forEach((m: { role: string; content: string }) => {
      if (m.role === "assistant") {
        const matches = [...m.content.matchAll(/<DRAF>([\s\S]*?)<\/DRAF>/g)];
        if (matches.length > 0) {
          accumulatedDraft = matches[matches.length - 1][1];
        } else if (m.content.includes("<DRAF>")) {
          // If there's an opening tag but no closing tag (e.g. cut off or stream), extract everything after it
          const index = m.content.lastIndexOf("<DRAF>");
          accumulatedDraft = m.content.substring(index + 6);
        }
      }
    });

    // 2. Fallback: if still empty, use assistant messages content but clean it
    if (!accumulatedDraft.trim()) {
      const assistantMessages = messages.filter((m: { role: string; content: string }) => m.role === "assistant");
      accumulatedDraft = assistantMessages
        .map((m: { role: string; content: string }) => {
          if (m.content.includes("<DRAF>")) {
            const idx = m.content.lastIndexOf("<DRAF>");
            const afterDraft = m.content.substring(idx + 6);
            return afterDraft.replace(/<\/DRAF>/g, "");
          }
          return m.content;
        })
        .filter((c: string) => c.length > 0)
        .join("\n\n");
    }

    // 3. Post-processing: clean any leftover raw tags, HTML-like markers, or backticks
    accumulatedDraft = accumulatedDraft
      .replace(/<DRAF>/g, "")
      .replace(/<\/DRAF>/g, "")
      .replace(/^`\s*untuk\s*memudahkan\s*Anda:?/gi, "")
      .replace(/^`|`$/g, "") // strip leading/trailing backticks
      .trim();

    const spacingValue = docType === "proposal" ? 360 : docType === "skripsi" ? 480 : 360;
    
    const sections: any[] = [];
    let currentSectionItems: (Paragraph | Table)[] = [];
    
    const pushCurrentSection = (isFirst = false) => {
      if (currentSectionItems.length > 0) {
        sections.push({
          properties: {
            page: {
              size: {
                width: 11906,  // A4 width in dxa (210mm)
                height: 16838, // A4 height in dxa (297mm)
              },
              margin: {
                top: 2268,    // 4 cm (as per UHN guideline)
                bottom: 1701, // 3 cm (as per UHN guideline)
                left: 2268,   // 4 cm (as per UHN guideline)
                right: 1701,  // 3 cm (as per UHN guideline)
              },
              ...(isFirst ? { pageNumber: { start: 1 } } : {})
            },
            titlePage: true,
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: "Times New Roman",
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            first: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: "Times New Roman",
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
          },
          children: currentSectionItems,
        });
        currentSectionItems = [];
      }
    };

    // Convert accumulated draft markdown to docx paragraphs
    const rawLines = accumulatedDraft.split("\n");

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        currentSectionItems.push(new Paragraph({ text: "" }));
        continue;
      }

      // Check if we hit a new chapter or reference page to partition into a new section
      const isBabHeading = /^BAB\s+(I{1,3}V?|VI{0,3}|IV|IX|X)\s*$/i.test(trimmed) || /^BAB\s+\d+\s*$/.test(trimmed);
      const isHeading1 = trimmed.startsWith("# ");
      const isDaftarPustaka = trimmed.toUpperCase() === "DAFTAR PUSTAKA" || trimmed.toUpperCase() === "# DAFTAR PUSTAKA";

      if (isBabHeading || isHeading1 || isDaftarPustaka) {
        pushCurrentSection(sections.length === 0);
      }

      // Table detection: starts with | and next line is separator
      if (trimmed.startsWith("|") && i + 1 < rawLines.length && rawLines[i + 1].trim().startsWith("|") && rawLines[i + 1].includes("-")) {
        const isHeaderRow = true;
        const tableRows: { cells: string[]; isHeader: boolean }[] = [];
        tableRows.push({ cells: parseMarkdownTableRow(trimmed), isHeader: true });
        i++; // skip separator line
        
        i++;
        while (i < rawLines.length && rawLines[i].trim().startsWith("|")) {
          tableRows.push({ cells: parseMarkdownTableRow(rawLines[i]), isHeader: false });
          i++;
        }
        i--;

        // Calculate max text length per column to allocate dynamic widths
        const numCols = tableRows[0].cells.length;
        const colMaxLengths = Array(numCols).fill(0);
        tableRows.forEach(r => {
          for (let colIdx = 0; colIdx < numCols; colIdx++) {
            const cellLength = r.cells[colIdx] ? r.cells[colIdx].length : 0;
            if (cellLength > colMaxLengths[colIdx]) {
              colMaxLengths[colIdx] = cellLength;
            }
          }
        });

        // Use maximum text length with a minimum character weight of 10 to prevent columns from being too narrow
        const colWeights = colMaxLengths.map(len => Math.max(len, 10));
        const totalWeight = colWeights.reduce((sum, w) => sum + w, 0);

        // Calculate cell widths as percentages
        const colWidthsPercent = colWeights.map(w => Math.floor((w / totalWeight) * 100));

        const docxRows = tableRows.map((row) => {
          return new TableRow({
            children: row.cells.map((cellText, cellIdx) => {
              const cellWidth = colWidthsPercent[cellIdx] || Math.floor(100 / numCols);
              return new TableCell({
                width: { size: cellWidth, type: WidthType.PERCENTAGE },
                shading: row.isHeader ? { fill: "D9D9D9" } : undefined,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: parseInlineMarkdown(cellText, { size: 22 }), // 11pt in cells
                    spacing: { before: 60, after: 60 }
                  })
                ]
              });
            })
          });
        });

        currentSectionItems.push(
          new Table({
            rows: docxRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        continue;
      }

      // BAB heading: line matches "BAB I", "BAB II", etc. — rendered as centered bold 14pt
      if (isBabHeading) {
        currentSectionItems.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            children: [
              new TextRun({
                text: trimmed.toUpperCase(),
                bold: true,
                font: "Times New Roman",
                size: 28, // 14pt
              })
            ]
          })
        );
        continue;
      }

      // Heading 1 (##) or lines like "PENDAHULUAN", "TINJAUAN PUSTAKA" after a BAB line
      if (trimmed.startsWith("# ")) {
        const headingText = trimmed.replace(/^#+ /, "").trim();
        currentSectionItems.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 240 },
            children: [
              new TextRun({
                text: headingText.toUpperCase(),
                bold: true,
                font: "Times New Roman",
                size: 28, // 14pt
              })
            ]
          })
        );
        continue;
      }

      // Heading 2: Sub-bab (e.g. "## 1.1 Latar Belakang")
      if (trimmed.startsWith("## ")) {
        const headingText = trimmed.replace(/^## /, "").trim();
        currentSectionItems.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 360, after: 120 },
            children: [
              new TextRun({
                text: headingText,
                bold: true,
                font: "Times New Roman",
                size: 24, // 12pt bold
              })
            ]
          })
        );
        continue;
      }

      // Heading 3: Sub-sub-bab (e.g. "### 1.1.1 ...")
      if (trimmed.startsWith("### ")) {
        const headingText = trimmed.replace(/^### /, "").trim();
        currentSectionItems.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 240, after: 80 },
            children: [
              new TextRun({
                text: headingText,
                bold: true,
                italics: true,
                font: "Times New Roman",
                size: 24, // 12pt
              })
            ]
          })
        );
        continue;
      }

      // Bullet list items
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const bulletText = trimmed.substring(2).trim();
        currentSectionItems.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            bullet: { level: 0 },
            spacing: { before: 60, after: 60, line: spacingValue, lineRule: "auto" },
            indent: { left: 720, hanging: 360 },
            children: parseInlineMarkdown(bulletText),
          })
        );
        continue;
      }

      // Numbered list items
      if (/^\d+\.\s/.test(trimmed)) {
        const numberMatch = trimmed.match(/^(\d+\.)\s(.+)/);
        if (numberMatch) {
          currentSectionItems.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 60, after: 60, line: spacingValue, lineRule: "auto" },
              indent: { left: 720, hanging: 360 },
              children: [
                new TextRun({
                  text: numberMatch[1] + " ",
                  font: "Times New Roman",
                  size: 24,
                }),
                ...parseInlineMarkdown(numberMatch[2]),
              ],
            })
          );
          continue;
        }
      }

      // Horizontal rule / separator line (e.g. "---")
      if (/^[-*_]{3,}$/.test(trimmed)) {
        currentSectionItems.push(new Paragraph({ text: "", spacing: { before: 120, after: 120 } }));
        continue;
      }

      // Normal paragraph text — JUSTIFIED with 1.5/2.0 line spacing and first-line indent
      currentSectionItems.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 0, after: 0, line: spacingValue, lineRule: "auto" },
          indent: { firstLine: 567 }, // 1 cm first line indent as per UHN guideline
          children: parseInlineMarkdown(trimmed),
        })
      );
    }

    // Push the final section
    pushCurrentSection(sections.length === 0);

    // Build the body document with margins
    const bodyDoc = new Document({
      sections: sections,
    });

    const bodyBuffer = await Packer.toBuffer(bodyDoc);

    let finalBuffer = bodyBuffer;

    // Load official cover and approval templates and graft body onto them (using fallback placeholders if fields are blank)
    const finalNama = (nama || "NAMA MAHASISWA UHN").trim().toUpperCase();
    const finalNim = (nim || "NIM MAHASISWA UHN").trim().toUpperCase();
    const finalJudul = (judul || "JUDUL TUGAS AKHIR MAHASISWA UHN").trim().toUpperCase();

    let templateName = "proposal_template.docx";
    let approvalTemplateName = "proposal_approval_template.docx";
    if (docType === "skripsi") {
      templateName = "skripsi_template.docx";
      approvalTemplateName = "skripsi_approval_template.docx";
    } else if (docType === "kpi") {
      templateName = "kpi_template.docx";
      approvalTemplateName = "kpi_approval_template.docx";
    }

    const templatePath = path.join(process.cwd(), "src", "templates", templateName);
    const approvalTemplatePath = path.join(process.cwd(), "src", "templates", approvalTemplateName);
    
    if (fs.existsSync(templatePath) && fs.existsSync(approvalTemplatePath)) {
      // 1. Render Cover Page
      const templateBuffer = fs.readFileSync(templatePath);
      const coverZip = new pizzip(templateBuffer);
      const coverDoc = new Docxtemplater(coverZip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      coverDoc.render({
        NAMA: finalNama,
        NIM: finalNim,
        JUDUL: finalJudul,
      });

      const coverFile = coverZip.file("word/document.xml");
      let coverXml = coverFile ? coverFile.asText() : "";
      
      // 2. Render Approval Page
      const approvalBuffer = fs.readFileSync(approvalTemplatePath);
      const approvalZip = new pizzip(approvalBuffer);
      const approvalDoc = new Docxtemplater(approvalZip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      approvalDoc.render({
        NAMA: finalNama,
        NIM: finalNim,
        JUDUL: finalJudul,
      });

        const approvalFile = approvalZip.file("word/document.xml");
        let approvalXml = approvalFile ? approvalFile.asText() : "";

        // 3. Get Body content XML
        const bodyZip = new pizzip(bodyBuffer);
        const bodyFile = bodyZip.file("word/document.xml");
        const bodyXml = bodyFile ? bodyFile.asText() : "";

        // Merge namespaces to avoid undeclared prefix errors (e.g. wp14) in Google Docs
        coverXml = mergeXmlNamespaces(coverXml, approvalXml);
        coverXml = mergeXmlNamespaces(coverXml, bodyXml);

        // 4. Perform XML grafting with Section Breaks to preserve margins, footers and page numbering
        const approvalStartTag = "<w:body>";
        const approvalStartIndex = approvalXml.indexOf(approvalStartTag) + approvalStartTag.length;
        const approvalEndIndex = approvalXml.lastIndexOf("<w:sectPr");
        const approvalContent = approvalXml.substring(approvalStartIndex, approvalEndIndex);
        const approvalSectPr = approvalXml.substring(approvalEndIndex, approvalXml.lastIndexOf("</w:body>"));
        const approvalSectionBreak = `<w:p><w:pPr>${approvalSectPr}</w:pPr></w:p>`;

        const coverEndIndex = coverXml.lastIndexOf("<w:sectPr");
        const coverSectPr = coverXml.substring(coverEndIndex, coverXml.lastIndexOf("</w:body>"));
        const coverSectionBreak = `<w:p><w:pPr>${coverSectPr}</w:pPr></w:p>`;
        const coverBodyContent = coverXml.substring(coverXml.indexOf("<w:body>") + "<w:body>".length, coverEndIndex);

        // 5. Perform XML grafting: merged cover/approval -> body content
        const bodyStartIndex = bodyXml.indexOf("<w:body>") + "<w:body>".length;
        const bodyEndIndex = bodyXml.lastIndexOf("<w:sectPr");
        const bodyContent = bodyXml.substring(bodyStartIndex, bodyEndIndex);
        const bodySectPr = bodyXml.substring(bodyEndIndex); // This is <w:sectPr>...</w:body></w:document>

        const documentHeader = coverXml.substring(0, coverXml.indexOf("<w:body>") + "<w:body>".length);

        const finalXml = documentHeader + coverBodyContent + coverSectionBreak + approvalContent + approvalSectionBreak + bodyContent + bodySectPr;
        
        coverZip.file("word/document.xml", finalXml);

        finalBuffer = coverZip.generate({
          type: "nodebuffer",
          compression: "DEFLATE",
        });
      }

    const filename = nama && nim ? `${docType || "draft"}_${nim}.docx` : "Draf_Skripsi_UHN.docx";

    return new NextResponse(new Uint8Array(finalBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (error) {
    console.error("Export Error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

