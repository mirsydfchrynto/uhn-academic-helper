import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

interface GenerateData {
  NAMA: string;
  NIM: string;
  JUDUL: string;
  [key: string]: unknown;
}

/**
 * Generates a compliant .docx document by injecting data into an existing template buffer
 */
export function generateDocx(templateBuffer: Buffer, data: GenerateData): Buffer {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Inject data and render the document (modern docxtemplater v4 syntax)
    doc.render(data);

    // Generate output buffer
    const outBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    return outBuffer;
  } catch (error) {
    console.error('Error generating document:', error);
    const err = error as Error;
    throw new Error('Gagal memproses penggabungan berkas template: ' + (err.message || ''));
  }
}

/**
 * Combines XML namespaces from multiple document XML chunks.
 * This is crucial when stitching DOCX parts (like Cover and Content) together, 
 * so that word processors don't fail due to undeclared namespace prefixes (e.g. w14: or w15:).
 */
export function mergeXmlNamespaces(xml1: string, xml2: string): string {
  const xmlnsRegex = /xmlns:([a-zA-Z0-9]+)="([^"]+)"/g;
  const namespaces = new Map<string, string>();
  
  // Extract from xml1
  let match;
  while ((match = xmlnsRegex.exec(xml1)) !== null) {
    namespaces.set(match[1], match[2]);
  }
  
  // Extract from xml2
  while ((match = xmlnsRegex.exec(xml2)) !== null) {
    namespaces.set(match[1], match[2]);
  }
  
  // Reconstruct root attributes
  const nsAttrs = Array.from(namespaces.entries())
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
    .join(" ");
    
  // Replace the original namespaces in xml1 with the merged ones
  return xml1.replace(/<w:document[^>]*>/, `<w:document ${nsAttrs}>`);
}
