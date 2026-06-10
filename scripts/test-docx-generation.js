const fs = require('fs');
const path = require('path');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

function testDocxGeneration() {
  const templatePath = path.join(__dirname, '../src/templates/proposal_template.docx');
  const outputPath = path.join(__dirname, '../test_generated_proposal_cover.docx');

  console.log(`Membaca template dari: ${templatePath}`);
  const content = fs.readFileSync(templatePath);

  try {
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    // Inject data
    const data = {
      NAMA: "M. IRSYAD FACHRYANTO",
      NIM: "23090111",
      JUDUL: "IMPLEMENTASI SISTEM ANTREAN HYBRID DENGAN ALGORITMA DYNAMIC WAIT-TIME ESTIMATION DAN ATURAN AUTO-SKIP (STUDI KASUS: FEBRIAN BARBERSHOP)"
    };

    console.log('Menyuntikkan data dan membuat berkas:', data);
    doc.render(data);

    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    fs.writeFileSync(outputPath, buffer);
    console.log(`\nSukses! Berkas uji coba berhasil dibuat di: ${outputPath}`);
  } catch (error) {
    console.error('Gagal membuat berkas Word:', error);
  }
}

testDocxGeneration();
