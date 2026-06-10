import { NextRequest, NextResponse } from 'next/server';
import { generateDocx, mergeXmlNamespaces } from '@/lib/documentGenerator';
import { createClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';
import pizzip from 'pizzip';
import Docxtemplater from 'docxtemplater';

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

    const contentType = req.headers.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type harus berupa multipart/form-data.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const docType = formData.get('docType') as string || 'proposal'; // proposal, skripsi, kpi
    const nama = formData.get('nama') as string || '';
    const nim = formData.get('nim') as string || '';
    const judul = formData.get('judul') as string || '';
    const customDataJson = formData.get('customData') as string || '{}';

    if (!nama || !nim || !judul) {
      return NextResponse.json(
        { error: 'Parameter wajib (nama, nim, judul) tidak boleh kosong.' },
        { status: 400 }
      );
    }

    // Parse custom additional data (if any)
    let customData = {};
    try {
      customData = JSON.parse(customDataJson);
    } catch (e) {
      console.warn('Failed to parse custom data JSON:', e);
    }

    // Merge standard data and custom data
    const mergeData = {
      NAMA: nama.toUpperCase(),
      NIM: nim.toUpperCase(),
      JUDUL: judul.toUpperCase(),
      ...customData
    };

    let generatedBuffer: Buffer;

    // Check if user uploaded a custom template file
    const uploadedFile = formData.get('templateFile') as File | null;
    
    if (uploadedFile) {
      const templateBuffer = Buffer.from(await uploadedFile.arrayBuffer());
      generatedBuffer = generateDocx(templateBuffer, mergeData);
    } else {
      // Load official clean templates from src/templates folder within the project
      let templateName = 'proposal_template.docx';
      let approvalTemplateName = 'proposal_approval_template.docx';

      if (docType === 'skripsi') {
        templateName = 'skripsi_template.docx';
        approvalTemplateName = 'skripsi_approval_template.docx';
      } else if (docType === 'kpi') {
        templateName = 'kpi_template.docx';
        approvalTemplateName = 'kpi_approval_template.docx';
      }

      const templatePath = path.join(process.cwd(), 'src', 'templates', templateName);
      const approvalTemplatePath = path.join(process.cwd(), 'src', 'templates', approvalTemplateName);

      if (!fs.existsSync(templatePath)) {
        return NextResponse.json(
          { error: `Template master tidak ditemukan di server: ${templateName}` },
          { status: 404 }
        );
      }

      if (fs.existsSync(approvalTemplatePath)) {
        // Render Cover Page
        const coverBuffer = fs.readFileSync(templatePath);
        const coverZip = new pizzip(coverBuffer);
        const coverDoc = new Docxtemplater(coverZip, {
          paragraphLoop: true,
          linebreaks: true,
        });
        coverDoc.render(mergeData);
        const coverXmlFile = coverZip.file("word/document.xml");
        if (!coverXmlFile) throw new Error("Template cover rusak: document.xml tidak ditemukan");
        let coverXml = coverXmlFile.asText();

        // Render Approval Page
        const approvalBuffer = fs.readFileSync(approvalTemplatePath);
        const approvalZip = new pizzip(approvalBuffer);
        const approvalDoc = new Docxtemplater(approvalZip, {
          paragraphLoop: true,
          linebreaks: true,
        });
        approvalDoc.render(mergeData);
        const approvalXmlFile = approvalZip.file("word/document.xml");
        if (!approvalXmlFile) throw new Error("Template approval rusak: document.xml tidak ditemukan");
        let approvalXml = approvalXmlFile.asText();

        // Merge namespaces
        coverXml = mergeXmlNamespaces(coverXml, approvalXml);

        // Perform XML grafting with Section Breaks to keep separate page styles
        const approvalStartTag = "<w:body>";
        const approvalStartIndex = approvalXml.indexOf(approvalStartTag) + approvalStartTag.length;
        const approvalEndIndex = approvalXml.lastIndexOf("<w:sectPr");
        const approvalContent = approvalXml.substring(approvalStartIndex, approvalEndIndex);
        const approvalSectPr = approvalXml.substring(approvalEndIndex); // This includes </w:body></w:document>

        const coverEndIndex = coverXml.lastIndexOf("<w:sectPr");
        const coverSectPr = coverXml.substring(coverEndIndex, coverXml.lastIndexOf("</w:body>"));
        const coverSectionBreak = `<w:p><w:pPr>${coverSectPr}</w:pPr></w:p>`;
        const coverBodyContent = coverXml.substring(coverXml.indexOf("<w:body>") + "<w:body>".length, coverEndIndex);

        const documentHeader = coverXml.substring(0, coverXml.indexOf("<w:body>") + "<w:body>".length);

        const finalXml = documentHeader + coverBodyContent + coverSectionBreak + approvalContent + approvalSectPr;

        coverZip.file("word/document.xml", finalXml);

        generatedBuffer = coverZip.generate({
          type: "nodebuffer",
          compression: "DEFLATE",
        });
      } else {
        // Fallback: If only cover exists
        const templateBuffer = fs.readFileSync(templatePath);
        generatedBuffer = generateDocx(templateBuffer, mergeData);
      }
    }

    // Set headers for file download
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    responseHeaders.set('Content-Disposition', `attachment; filename="${docType}_${nim}.docx"`);

    return new NextResponse(new Uint8Array(generatedBuffer), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Generate API Error:', error);
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal pada server.' },
      { status: 500 }
    );
  }
}
