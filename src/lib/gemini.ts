import { VertexAI } from '@google-cloud/vertexai';
import { ChatOpenAI } from '@langchain/openai';

const ROUTER_MODEL_FALLBACKS = [
  'vx/gemini-2.5-flash',
  'vx/gemini-3-flash-preview',
  'vx/gemini-3.1-flash-lite-preview',
  'kr/claude-sonnet-4.5-thinking-agentic'
];


/**
 * Interface representing the response of the humanizing engine
 */
interface HumanizeResult {
  text: string;
  success: boolean;
  modelUsed?: string;
  error?: string;
}

// List of fallback models from best (newest) to oldest
const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.5-pro',
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

9. HINDARI KATA GANTI ORANG PERTAMA/KEDUA (KRUSIAL):
   - Dilarang keras menggunakan kata "saya", "kami", "penulis", "penyusun", "kita", "kamu", atau "anda".
   - Tulis ulang kalimat tersebut menggunakan bentuk kalimat pasif (contoh: "Sistem ini dirancang..." bukan "Saya merancang sistem ini...").

10. FORMAT OUTPUT:
    - Kembalikan HANYA teks hasil parafrase/humanisasi yang sudah selesai tanpa tambahan penjelasan, pengantar, atau penutup apa pun.
`;

/**
 * Rewrites academic text to feel natural and humanized in Indonesian with model fallbacks
 */
export async function humanizeAcademicText(
  text: string,
  apiKey?: string,
  modelName?: string
): Promise<HumanizeResult> {
  const use9router = process.env.USE_9ROUTER === "true";

  if (use9router) {
    // If a model is specifically requested (and is a 9router model like kr/*), use it, otherwise fall back to Sonnet/Haiku
    const modelsToTry = modelName && modelName.startsWith('kr/')
      ? [modelName, ...ROUTER_MODEL_FALLBACKS.filter(m => m !== modelName)]
      : ROUTER_MODEL_FALLBACKS;

    const attemptedErrors: string[] = [];

    for (const model of modelsToTry) {
      try {
        console.log(`Trying 9router free model: ${model}`);
        const chat = new ChatOpenAI({
          modelName: model,
          apiKey: process.env.ROUTER_API_KEY || "9router",
          configuration: {
            baseURL: process.env.ROUTER_BASE_URL || "http://localhost:20128/v1"
          },
          temperature: 0.7,
        });

        const response = await chat.invoke([
          ["system", HUMANIZER_SYSTEM_INSTRUCTION],
          ["human", `Humanize teks akademik berikut:\n\n${text}`]
        ]);

        const responseText = response.content as string;
        if (!responseText) {
          throw new Error('Model mengembalikan respon kosong.');
        }

        return {
          text: responseText.trim(),
          success: true,
          modelUsed: model
        };
      } catch (error) {
        const err = error as Error;
        console.warn(`9router Model ${model} failed:`, err.message || err);
        attemptedErrors.push(`${model}: ${err.message || String(error)}`);
      }
    }

    return {
      text,
      success: false,
      error: `Semua model 9router gagal memproses:\n- ${attemptedErrors.join('\n- ')}`
    };
  }

  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_REGION || 'us-central1';

  if (!project) {
    return {
      text,
      success: false,
      error: 'ID Proyek GCP Vertex AI (GCP_PROJECT_ID) tidak terkonfigurasi di server.'
    };
  }

  // Determine models to try (if a specific model is requested, try it first, then try the fallbacks)
  const modelsToTry = modelName 
    ? [modelName, ...GEMINI_MODEL_FALLBACKS.filter(m => m !== modelName)]
    : GEMINI_MODEL_FALLBACKS;

  const attemptedErrors: string[] = [];

  for (const model of modelsToTry) {
    try {
      console.log(`Trying Vertex AI model: ${model}`);
      const vertexAI = new VertexAI({
        project: project,
        location: location
      });
      
      const geminiModel = vertexAI.getGenerativeModel({
        model: model,
        systemInstruction: HUMANIZER_SYSTEM_INSTRUCTION
      });

      const prompt = `Humanize teks akademik berikut:\n\n${text}`;

      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
        }
      });

      const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Model mengembalikan respon kosong.');
      }

      return {
        text: responseText.trim(),
        success: true,
        modelUsed: model
      };
    } catch (error) {
      const err = error as Error;
      console.warn(`Model ${model} failed:`, err.message || err);
      attemptedErrors.push(`${model}: ${err.message || String(error)}`);
    }
  }

  // If all models failed, return the accumulated errors
  return {
    text,
    success: false,
    error: `Semua model Vertex AI gagal memproses:\n- ${attemptedErrors.join('\n- ')}`
  };
}
