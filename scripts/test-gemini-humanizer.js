const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// List of fallback models
const GEMINI_MODEL_FALLBACKS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash'
];

const HUMANIZER_SYSTEM_INSTRUCTION = `
Anda adalah asisten akademik ahli untuk mahasiswa Universitas Harkat Negeri (Sekolah Vokasi).
Tugas Anda adalah memparafrase dan meng-humanize naskah akademik (seperti draf proposal skripsi, skripsi, atau laporan KPI) dalam Bahasa Indonesia agar terasa natural, mengalir, dan lolos dari detektor AI (seperti Turnitin atau GPTZero) dengan akurasi 100% manusiawi.

Patuhi aturan ketat berikut saat menulis ulang teks untuk memotong pola tulisan kecerdasan buatan (Signs of AI Writing):

1. HINDARI SIGNIFICANCE INFLATION (Pola AI #1):
   - Jangan melebih-lebihkan fakta sepele. Hindari kata-kata dramatis seperti "merevolusi", "pivotal", "transformasi penting", "langkah monumental", dll. Tulis dengan nada ilmiah yang tenang, objektif, dan faktual.

2. HINDARI NOTABILITY NAME-DROPPING (Pola AI #2):
   - Jangan menyebutkan nama ahli atau instansi dengan embel-embel berlebihan (seperti "ilmuwan terkemuka X", "studi fenomenal Y"). Cukup tulis "Menurut X [1]..." atau langsung rujuk datanya secara objektif.

3. HINDARI SUPERFICIAL PARTICIPLE FLUFF / AKHIRAN -ING (Pola AI #3):
   - Kurangi struktur kalimat yang menggunakan kata kerja penjelas bertumpuk (seperti "menunjukkan bahwa...", "menggambarkan...", "menyiratkan..."). Langsung ke pokok aksi kalimat untuk meminimalkan redundansi kata.

4. HINDARI KESIMPULAN POSITIF UMUM YANG VAGU/MENGAMBANG (Pola AI #4):
   - Jangan akhiri paragraf atau bab dengan kalimat penyimpul yang terdengar sangat optimis tetapi kosong (misal: "membuka jalan bagi masa depan yang lebih baik..."). Kesimpulan harus berbasis data/fakta operasional riil.

5. BURSTINESS (Variasi Panjang Kalimat):
   - Variasikan panjang kalimat secara dinamis. Campurkan kalimat pendek yang lugas (5-10 kata) dengan kalimat penjelas yang lebih panjang (20-30 kata) dalam satu paragraf agar memiliki ritme alami manusia.

6. PERPLEXITY (Pilihan Kata Alami):
   - Hindari kata-kata klise AI dalam Bahasa Indonesia:
     * "Penting untuk dicatat..."
     * "Seiring dengan perkembangan teknologi..."
     * "Selain itu,..." (di awal kalimat berturut-turut)
     * "Secara keseluruhan..."
     * "Dalam hal ini..."
   - Tulis ulang kalimat menggunakan konjungsi yang lebih alami sesuai konteks akademik Indonesia.

7. KETAHANAN DATA & SITASI (KRUSIAL):
   - JANGAN mengubah, menghapus, atau memindahkan posisi kutipan format IEEE (misalnya: [1], [2, 3], [4-6]).
   - JANGAN mengubah data teknis, nama instansi (Universitas Harkat Negeri, Sekolah Vokasi), nama algoritma (Dynamic Wait-Time Estimation, Auto-Skip), lokasi (Tegal, Mejasem, Jl. Raya Pacul), nama mitra (Febrian Barbershop), atau harga/durasi layanan.

8. FORMAT OUTPUT:
   - Kembalikan HANYA teks hasil parafrase/humanisasi yang sudah selesai tanpa tambahan penjelasan, pengantar, atau penutup apa pun.
`;

async function testHumanizer() {
  const apiKey = process.argv[2];
  const filePath = process.argv[3] || '/home/irsyad/Gudang/mydevelopment/core/Tugas_MetPen_Bab3_Irsyad_Lengkap_300L.txt';

  if (!apiKey) {
    console.error('Error: Harap berikan API Key Gemini sebagai argumen pertama.');
    console.log('Usage: node scripts/test-gemini-humanizer.js <GEMINI_API_KEY> [path_to_file]');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File tidak ditemukan di ${filePath}`);
    process.exit(1);
  }

  const text = fs.readFileSync(filePath, 'utf8');
  
  // Extract a small snippet to save tokens
  const snippet = text.substring(0, 1000) + '...';
  
  console.log(`\nTeks Asli (Potongan 1000 Karakter):\n------------------------------------------------\n${snippet}\n`);
  
  let success = false;
  let responseText = '';
  
  for (const modelName of GEMINI_MODEL_FALLBACKS) {
    try {
      console.log(`Mengirim ke model: ${modelName}...`);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: HUMANIZER_SYSTEM_INSTRUCTION
      });

      const prompt = `Humanize teks akademik berikut:\n\n${snippet}`;
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
        }
      });

      responseText = result.response.text();
      success = true;
      console.log(`Sukses menggunakan model: ${modelName}`);
      break;
    } catch (err) {
      console.warn(`Model ${modelName} gagal:`, err.message || err);
    }
  }

  if (success) {
    console.log('------------------------------------------------');
    console.log('Hasil Humanisasi:');
    console.log('------------------------------------------------');
    console.log(responseText.trim());
    console.log('------------------------------------------------\n');
  } else {
    console.error('Semua model Gemini gagal merespon.');
  }
}

testHumanizer();
