import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 1. Tool: Pencari Jurnal Dasar
export const verifyAcademicSourceTool = tool(
  async ({ query }) => {
    try {
      console.log(`[MCP TOOL] Mengeksekusi CrossRef Search: ${query}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(
        `https://api.crossref.org/works?query=${encodeURIComponent(query)}&select=title,author,URL,published-print,published-online,DOI&rows=5`,
        { 
          headers: { 
            "User-Agent": "UHNAcademicAgent/1.0 (mailto:admin@uhn.ac.id)" 
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeout);
      
      if (!res.ok) return "Gagal menghubungi database akademik.";

      const data = await res.json();
      const items = data.message.items;

      if (!items || items.length === 0) {
        return "Tidak ditemukan jurnal relevan. Minta pengguna mengganti kata kunci.";
      }

      const formattedResults = items.map((item: Record<string, any>, index: number) => {
        const title = item.title?.[0] || "Tanpa Judul";
        const authors = (item.author || [])
          .slice(0, 3)
          .map((a: any) => {
             const nameParts = [a.family, a.given].filter(Boolean);
             return nameParts.join(" ");
          })
          .filter(Boolean)
          .join(", ");
        const authorStr = authors || "Tanpa Penulis";
        const suffix = (item.author || []).length > 3 ? " et al." : "";
        const year = item["published-print"]?.["date-parts"]?.[0]?.[0] || item["published-online"]?.["date-parts"]?.[0]?.[0] || "Tahun Tidak Diketahui";
        const url = item.URL || "Tidak Ada URL";
        const doi = item.DOI || "";
        return `${index + 1}. **[${title}](${url})** oleh ${authorStr}${suffix} (${year}) - DOI: \`${doi}\``;
      }).join("\n");

      return `Ditemukan referensi valid:\n${formattedResults}\n\nJika pengguna meminta detail lebih lanjut tentang salah satu jurnal, gunakan tool 'fetch_journal_abstract' dengan DOI yang tertera.`;
    } catch (error: any) {
      return `Kesalahan pencarian sumber: ${error.message}`;
    }
  },
  {
    name: "verify_academic_source",
    description: "Mencari referensi jurnal nyata di database akademik (CrossRef) berdasarkan kata kunci.",
    schema: z.object({
      query: z.string().describe("Kata kunci riset spesifik (contoh: 'CNN skin cancer detection')."),
    }),
  }
);

// 2. Tool: Pembaca Abstrak Jurnal Ekstraksi Dalam (Deep Fetch)
export const fetchJournalAbstractTool = tool(
  async ({ doi }) => {
    try {
      console.log(`[MCP TOOL] Menarik Abstrak untuk DOI: ${doi}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (!res.ok) return "Jurnal dengan DOI tersebut tidak ditemukan atau server memblokir akses.";

      const data = await res.json();
      const item = data.message;
      
      const abstractRaw = item.abstract || "Abstrak tidak disediakan secara publik oleh penerbit untuk jurnal ini.";
      const cleanAbstract = abstractRaw.replace(/<[^>]+>/g, '').trim();

      return `Abstrak Jurnal:\n"${cleanAbstract}"\n\nGunakan informasi ini untuk membahas latar belakang atau metode dengan pengguna secara mendalam.`;
    } catch (error: any) {
      return `Gagal mengekstrak abstrak: ${error.message}`;
    }
  },
  {
    name: "fetch_journal_abstract",
    description: "Menarik dan membaca isi abstrak jurnal secara mendalam berdasarkan kode DOI untuk membedah metodologinya.",
    schema: z.object({
      doi: z.string().describe("Kode DOI jurnal (contoh: '10.1109/CVPR.2016.90')."),
    }),
  }
);

// 3. Verifikasi Panduan Akademik Universitas Harkat Negeri (Local RAG — Diperkuat)
export const checkUHNGuidelinesTool = tool(
  async ({ docType, section }) => {
    console.log(`[MCP TOOL] Mengecek Buku Pedoman UHN: Tipe = ${docType}, Bagian = ${section}`);
    
    const guidelines: Record<string, Record<string, string>> = {
      proposal: {
        umum: `PANDUAN UMUM PENULISAN PROPOSAL SKRIPSI UHN:
FORMAT DOKUMEN:
- Kertas: A4, margin: Kiri 4 cm, Kanan 3 cm, Atas 4 cm, Bawah 3 cm
- Font: Times New Roman 12pt untuk isi, 14pt bold untuk judul bab
- Spasi: 1,5 spasi untuk isi teks, 1 spasi untuk tabel dan gambar
- Penomoran bab: BAB I, BAB II, BAB III (romawi kapital)
- Penomoran sub-bab: 1.1, 1.2, 2.1, 2.2 dst.
- Penomoran sub-sub-bab: 1.1.1, 1.1.2 dst.
- Paragraf: Indented 1,25 cm di baris pertama, rata kiri-kanan (justify)
- Penomoran halaman: Romawi kecil (i, ii, iii) untuk bagian awal, Arab (1, 2, 3) mulai Bab I
- Sitasi: Gaya IEEE — nomor urut di dalam kurung kotak, contoh: [1], [2], [1,3]
STRUKTUR PROPOSAL:
Halaman Judul → Lembar Persetujuan → Kata Pengantar → Daftar Isi → Daftar Gambar → Daftar Tabel → BAB I → BAB II → BAB III → Daftar Pustaka`,

        bab1: `PANDUAN BAB I — PENDAHULUAN (Proposal Skripsi UHN):

1.1 LATAR BELAKANG
- Panjang: 3-5 paragraf, sekitar 400-600 kata
- Paragraf 1: Gambaran umum kondisi/permasalahan global/nasional yang menjadi konteks
- Paragraf 2: Kondisi spesifik di objek penelitian (perusahaan/institusi yang diteliti)
- Paragraf 3: Kerugian/dampak jika masalah tidak diselesaikan + data pendukung konkret
- Paragraf 4: Solusi yang diusulkan dan dasar ilmiahnya dengan minimal 1 referensi jurnal [x]
- Paragraf 5: Penegasan urgensi dan relevansi solusi tersebut
- WAJIB ada minimal 2 kutipan IEEE [x] dari jurnal/penelitian relevan
- HINDARI: kalimat umum tanpa data, pernyataan tanpa sitasi

1.2 RUMUSAN MASALAH
- Wajib dalam bentuk kalimat tanya
- Jumlah: 2-4 pertanyaan spesifik
- Contoh yang benar: "Bagaimana cara merancang sistem antrean berbasis QR Code yang dapat mengurangi waktu tunggu pelanggan di Barbershop XYZ?"
- Dimulai dari yang paling umum ke paling spesifik

1.3 BATASAN MASALAH
- Minimal 3 poin pembatas yang jelas dan terukur
- Format: Daftar bernomor
- Contoh: "1. Sistem hanya dikembangkan untuk manajemen antrean layanan potong rambut, tidak mencakup manajemen keuangan." 
- JANGAN batasan yang terlalu luas (seperti "penelitian ini hanya berfokus pada sistem")

1.4 TUJUAN PENELITIAN
- Harus menjawab langsung setiap rumusan masalah
- Kata kerja aktif wajib: merancang, membuat, mengembangkan, menganalisis, mengimplementasikan, menguji
- Jumlah tujuan = jumlah rumusan masalah
- Contoh: "Merancang dan mengimplementasikan sistem antrean berbasis QR Code untuk meningkatkan efisiensi layanan pada Barbershop XYZ."

1.5 MANFAAT PENELITIAN
- Dibagi 2 sub-bagian:
  a. Manfaat Teoritis: Kontribusi bagi perkembangan ilmu/referensi akademik
  b. Manfaat Praktis: Manfaat nyata bagi objek penelitian dan pengguna sistem

1.6 KEASLIAN PENELITIAN (Tabel Penelitian Terdahulu)
- Wajib berupa tabel perbandingan dengan 3-5 penelitian sebelumnya
- Kolom tabel: No | Peneliti (Tahun) | Judul | Metode | Hasil | Perbedaan dengan penelitian ini
- Minimal 2 dari jurnal nasional terakreditasi (Sinta), 1 jurnal internasional
- Tahun penelitian terdahulu: maksimal 5 tahun ke belakang dari tahun sekarang`,

        bab2: `PANDUAN BAB II — TINJAUAN PUSTAKA DAN LANDASAN TEORI (Proposal Skripsi UHN):

2.1 TINJAUAN PUSTAKA
- Ini BERBEDA dengan tabel penelitian terdahulu di Bab 1
- Berisi narasi pembahasan mendalam tentang penelitian-penelitian sebelumnya
- Untuk setiap penelitian yang dikutip, jelaskan: apa yang diteliti, metode apa yang dipakai, apa hasilnya, dan apa relevansinya dengan penelitian ini
- Minimal 4-6 penelitian dibahas, paling tidak 1 jurnal internasional
- Setiap klaim wajib disertai sitasi IEEE [x]

2.2 LANDASAN TEORI
- Berisi penjelasan teori-teori dasar yang menjadi pondasi penelitian
- Setiap sub-bagian membahas 1 konsep/teknologi utama
- Struktur per sub-bab: Definisi → Cara kerja/konsep → Relevansi dengan penelitian ini
- WAJIB dari sumber ilmiah (jurnal/buku), SANGAT DILARANG dari Wikipedia/blog
- Setiap paragraf yang memuat definisi/teori dari sumber lain WAJIB disitasi [x]
- Sub-bab yang biasa ada tergantung topik (contoh untuk sistem informasi): 
  * Sistem Informasi
  * Basis Data / Database
  * Teknologi/Framework yang digunakan (PHP, Laravel, MySQL, dll.)
  * Metodologi pengembangan sistem (Waterfall, Agile, dll.)
  * Metode pengujian (Black Box Testing, UAT, dll.)`,

        bab3: `PANDUAN BAB III — METODOLOGI PENELITIAN (Proposal Skripsi UHN):

3.1 BAHAN DAN ALAT PENELITIAN
- Sub-bab 3.1.1 Bahan Penelitian: Data yang akan digunakan (dataset, data primer/sekunder, sumber data)
- Sub-bab 3.1.2 Alat Penelitian:
  * Hardware: Spesifikasi komputer/laptop/server (Processor, RAM, Storage)
  * Software: Daftar lengkap tools (OS, IDE, framework, database, bahasa pemrograman, tools pendukung)

3.2 ALUR PENELITIAN
- Harus digambarkan sebagai flowchart/diagram alir
- Dalam format teks, tuliskan tahapan secara berurutan dan jelas:
  1. Identifikasi Masalah → 2. Studi Literatur → 3. Pengumpulan Data → 4. Analisis Kebutuhan → 5. Perancangan Sistem → 6. Implementasi → 7. Pengujian → 8. Kesimpulan
- Setiap tahapan dijelaskan secara singkat (2-3 kalimat)

3.3 METODE PENGUMPULAN DATA
- Sebutkan dan jelaskan metode yang digunakan: Observasi, Wawancara, Kuesioner, Studi Dokumentasi, dll.
- Untuk setiap metode: jelaskan apa yang dikumpulkan dan dari siapa/sumber mana

3.4 ANALISIS DAN PERANCANGAN SISTEM
- Analisis sistem yang sedang berjalan (AS-IS): Alur proses saat ini beserta kelemahannya
- Analisis kebutuhan sistem (TO-BE): Kebutuhan fungsional dan non-fungsional
- Perancangan sistem: Deskripsi arsitektur sistem, Use Case Diagram (naratif teks), rancangan antarmuka (mockup awal)

3.5 JADWAL PENELITIAN
- Tabel gantt chart jadwal kegiatan penelitian (6-8 bulan)
- Kolom: No | Kegiatan | Bulan 1 | Bulan 2 | ... | Bulan 6`,
      },

      skripsi: {
        umum: `PANDUAN UMUM PENULISAN SKRIPSI UHN:
FORMAT DOKUMEN:
- Kertas: A4, margin: Kiri 4 cm, Kanan 3 cm, Atas 4 cm, Bawah 3 cm
- Font: Times New Roman 12pt untuk isi, 14pt bold untuk judul bab
- Spasi: 1,5 spasi untuk isi teks, 1 spasi untuk tabel, gambar, dan kode program
- Penomoran bab: BAB I, BAB II, BAB III, BAB IV, BAB V (romawi kapital)
- Sitasi: Gaya IEEE
STRUKTUR SKRIPSI (5 Bab):
Halaman Judul → Lembar Pernyataan Keaslian → Lembar Persetujuan → Lembar Pengesahan → Abstrak (Ind & Ing) → Kata Pengantar → Daftar Isi → Daftar Gambar → Daftar Tabel → BAB I → BAB II → BAB III → BAB IV → BAB V → Daftar Pustaka → Lampiran`,

        bab1: `PANDUAN BAB I — PENDAHULUAN (Skripsi UHN):

1.1 LATAR BELAKANG
- Panjang: 4-6 paragraf, sekitar 500-800 kata
- Paragraf 1: Konteks global/nasional masalah yang diteliti + data/fakta aktual dengan sitasi
- Paragraf 2: Kondisi spesifik objek penelitian dan masalah yang dihadapi
- Paragraf 3: Dampak negatif masalah jika tidak segera diatasi (dengan data konkret)
- Paragraf 4: Tinjauan singkat solusi yang pernah dilakukan peneliti lain [referensi 2-3 jurnal]
- Paragraf 5: Solusi yang diusulkan penelitian ini, keunggulannya, dan justifikasi pemilihan metode
- Paragraf 6 (opsional): Penegasan kontribusi penelitian
- Wajib minimal 3 kutipan IEEE [x]

1.2 RUMUSAN MASALAH (kalimat tanya, 2-4 butir)

1.3 BATASAN MASALAH (minimal 4 poin spesifik dan terukur)

1.4 TUJUAN PENELITIAN (menjawab setiap rumusan masalah, kata kerja aktif)

1.5 MANFAAT PENELITIAN
- Manfaat Teoritis
- Manfaat Praktis (bagi objek penelitian, bagi pengguna, bagi peneliti selanjutnya)

1.6 SISTEMATIKA PENULISAN
- Uraikan ringkas isi setiap bab dari Bab I hingga Bab V
- Format: "BAB I PENDAHULUAN berisi tentang..." dst.`,

        bab2: `PANDUAN BAB II — TINJAUAN PUSTAKA DAN LANDASAN TEORI (Skripsi UHN):

2.1 TINJAUAN PUSTAKA
- Narasi mendalam 4-6 penelitian terdahulu
- Setiap penelitian: nama peneliti, tahun, judul, metode, hasil, dan perbedaan/persamaan dengan penelitian ini
- Diakhiri dengan tabel perbandingan ringkas semua penelitian terdahulu
- Minimal 1 jurnal internasional terindeks (Scopus/WoS)

2.2 LANDASAN TEORI (sub-bab per konsep/teknologi)
- Setiap sub-bab: Definisi formal [sitasi] → Penjelasan detail → Relevansi dengan penelitian
- Wajib ada: teori sistem informasi/teknologi utama + metode pengembangan + metode pengujian
- Semua klaim teoritis WAJIB disitasi IEEE [x]`,

        bab3: `PANDUAN BAB III — METODOLOGI PENELITIAN (Skripsi UHN):

3.1 BAHAN DAN ALAT PENELITIAN
- 3.1.1 Bahan: Dataset, data primer/sekunder, sumber data
- 3.1.2 Alat: Hardware (spesifikasi lengkap) + Software (semua tools)

3.2 METODE PENGEMBANGAN SISTEM
- Jelaskan model SDLC yang dipilih (Waterfall, Agile/Scrum, Prototype, dll.) dan alasannya
- Uraikan setiap fase dalam model SDLC tersebut sebagaimana diterapkan dalam penelitian ini

3.3 METODE PENGUMPULAN DATA
- Observasi, Wawancara, Kuesioner, Dokumentasi — jelaskan masing-masing

3.4 ANALISIS KEBUTUHAN SISTEM
- 3.4.1 Analisis Sistem Berjalan: Deskripsi + flowchart proses lama
- 3.4.2 Kebutuhan Fungsional: Daftar fitur yang HARUS ada di sistem
- 3.4.3 Kebutuhan Non-Fungsional: Performa, keamanan, kemudahan penggunaan, dll.

3.5 PERANCANGAN SISTEM
- 3.5.1 Use Case Diagram: Aktor + use case + deskripsi skenario tiap use case
- 3.5.2 Activity Diagram: Alir aktivitas untuk proses utama
- 3.5.3 Class Diagram / ERD: Struktur kelas atau entitas database
- 3.5.4 Perancangan Antarmuka: Wireframe/mockup halaman-halaman utama sistem
- 3.5.5 Perancangan Database: Struktur tabel, field, tipe data, relasi`,

        bab4: `PANDUAN BAB IV — HASIL DAN PEMBAHASAN (Skripsi UHN):

4.1 IMPLEMENTASI SISTEM
- 4.1.1 Lingkungan Implementasi: Spesifikasi server/hosting, stack teknologi yang digunakan
- 4.1.2 Implementasi Database: Screenshot struktur tabel di phpMyAdmin/tools DB
- 4.1.3 Implementasi Antarmuka: Screenshot setiap halaman sistem yang sudah jadi
  * Untuk setiap screenshot: Gambar [x.x] Halaman [nama halaman]
  * Dibawah setiap gambar: penjelasan 2-4 kalimat tentang fungsi/fitur halaman tersebut
- 4.1.4 Potongan Kode Program Utama: Lampirkan dan jelaskan kode inti sistem (bukan semua kode)

4.2 PENGUJIAN SISTEM
- 4.2.1 Pengujian Black Box Testing:
  * Tabel pengujian: No | Fungsi yang Diuji | Data Input | Hasil yang Diharapkan | Hasil Aktual | Status (Berhasil/Gagal)
  * Minimal uji 10-15 skenario pengujian dari semua fitur utama
- 4.2.2 Pengujian UAT (User Acceptance Testing):
  * Jelaskan responden pengujian (siapa, berapa orang, dari mana)
  * Tabel kuesioner: No | Pernyataan | SS | S | N | TS | STS
  * Hasil persentase dan interpretasi
- 4.2.3 Analisis Hasil Pengujian: Kesimpulan dari semua pengujian

4.3 PEMBAHASAN
- Korelasi antara hasil implementasi dengan tujuan penelitian yang ditetapkan di Bab I
- Perbandingan hasil dengan penelitian terdahulu di Bab II
- Kelebihan dan kekurangan sistem yang telah dibangun`,

        bab5: `PANDUAN BAB V — PENUTUP (Skripsi UHN):

5.1 KESIMPULAN
- Wajib menjawab setiap rumusan masalah di Bab I secara langsung dan terukur
- Jumlah kesimpulan = jumlah rumusan masalah
- Berupa pernyataan faktual hasil penelitian, BUKAN opini umum
- Cantumkan angka/data konkret dari hasil pengujian
- Contoh: "Sistem antrean berbasis QR Code berhasil dirancang dan diimplementasikan dengan tingkat keberhasilan pengujian black box sebesar 100% (15/15 skenario) dan nilai rata-rata UAT sebesar 4,3/5,0 (kategori Sangat Setuju)."

5.2 SARAN
- Minimal 3 saran spesifik dan realistis untuk pengembangan selanjutnya
- Saran berdasarkan keterbatasan sistem yang ada (mengacu Bab I Batasan Masalah dan Bab IV Pembahasan)
- Bisa berupa: saran teknis (fitur tambahan), saran metodologis, saran praktis`,
      },

      kpi: {
        umum: `PANDUAN UMUM PENULISAN LAPORAN KPI UHN:
FORMAT DOKUMEN:
- Kertas: A4, margin: Kiri 4 cm, Kanan 3 cm, Atas 4 cm, Bawah 3 cm
- Font: Times New Roman 12pt untuk isi, 14pt bold untuk judul bab
- Spasi: 1,5 spasi
- Penomoran bab: BAB I, BAB II, BAB III, BAB IV (romawi kapital)
- Sitasi: Gaya IEEE
STRUKTUR LAPORAN KPI (4 Bab):
Halaman Judul → Lembar Persetujuan (Dosen Pembimbing & Pembimbing Industri) → Lembar Pengesahan → Kata Pengantar → Daftar Isi → BAB I → BAB II → BAB III → BAB IV → Daftar Pustaka → Lampiran (Surat Tugas, Logbook, Dokumentasi Foto)`,

        bab1: `PANDUAN BAB I — PENDAHULUAN (Laporan KPI UHN):

1.1 LATAR BELAKANG KERJA PRAKTIK INDUSTRI
- Paragraf 1: Pentingnya link & match antara dunia akademik dan industri dalam era digital
- Paragraf 2: Profil singkat mitra industri dan bidang usaha/layanannya
- Paragraf 3: Masalah atau tantangan operasional/teknis yang ditemukan di mitra
- Paragraf 4: Urgensi pelaksanaan KPI dan apa yang akan dikontribusikan mahasiswa
- Wajib mencantumkan minimal 1 referensi tentang pentingnya praktik kerja industri [x]

1.2 RUMUSAN MASALAH
- Fokus pada masalah teknis/operasional yang dihadapi di tempat KPI
- 2-3 pertanyaan dalam bentuk kalimat tanya

1.3 BATASAN MASALAH
- Batasan ruang lingkup tugas dan proyek yang dikerjakan selama KPI
- Minimal 3 poin

1.4 TUJUAN KPI
- Tujuan yang berkaitan dengan misi akademik (kompetensi yang diperoleh)
- Tujuan yang berkaitan dengan kontribusi ke mitra (masalah yang diselesaikan)

1.5 MANFAAT KPI
- Manfaat bagi mahasiswa (skill, pengalaman, jaringan)
- Manfaat bagi mitra industri (solusi yang diberikan)
- Manfaat bagi institusi (informasi link & match)

1.6 WAKTU DAN TEMPAT PELAKSANAAN
- Nama perusahaan/instansi mitra
- Alamat lengkap
- Periode pelaksanaan (tanggal mulai - tanggal selesai, total minggu/bulan)
- Unit/divisi/departemen tempat ditempatkan`,

        bab2: `PANDUAN BAB II — GAMBARAN UMUM PERUSAHAAN/INSTANSI (Laporan KPI UHN):

2.1 PROFIL PERUSAHAAN/INSTANSI
- Nama resmi perusahaan/instansi
- Sejarah singkat berdirinya (tahun, pendiri, perkembangan)
- Bidang usaha / layanan utama
- Alamat, website, kontak resmi
- Skala perusahaan (lokal/nasional/internasional, jumlah karyawan)

2.2 VISI DAN MISI
- Tuliskan visi resmi perusahaan
- Tuliskan misi-misi resmi perusahaan (biasanya berupa daftar poin)

2.3 STRUKTUR ORGANISASI
- Gambarkan bagan struktur organisasi (dalam teks: deskripsi hierarki jabatan)
- Fokuskan pada unit/divisi tempat mahasiswa ditempatkan
- Jelaskan tugas dan tanggung jawab setiap posisi yang relevan

2.4 UNIT KERJA TEMPAT KPI
- Nama unit/divisi/departemen
- Tugas pokok dan fungsi unit tersebut
- Posisi dan peran mahasiswa selama KPI di unit ini`,

        bab3: `PANDUAN BAB III — AKTIVITAS KPI DAN PEMBAHASAN (Laporan KPI UHN):

3.1 RENCANA DAN REALISASI KEGIATAN KPI
- Tabel aktivitas mingguan:
  | No | Minggu ke- | Tanggal | Kegiatan yang Direncanakan | Kegiatan yang Dilaksanakan | Keterangan |
- Isi semua minggu selama periode KPI

3.2 ANALISIS KONDISI SISTEM/PROSES YANG BERJALAN
- Deskripsikan kondisi sistem atau proses operasional yang ada di mitra saat ini
- Identifikasi masalah, kekurangan, atau peluang perbaikan yang ditemukan
- Sertakan analisis: mengapa kondisi ini kurang efisien/optimal

3.3 CAPSTONE PROJECT / SOLUSI YANG DIKERJAKAN
Ini adalah bagian terpenting dari laporan KPI. Jelaskan secara teknis mendalam:
- 3.3.1 Deskripsi Proyek: Nama, tujuan, dan ruang lingkup proyek
- 3.3.2 Analisis Kebutuhan: Kebutuhan fungsional dan non-fungsional proyek
- 3.3.3 Perancangan Solusi: Arsitektur, flowchart, desain antarmuka, struktur database
- 3.3.4 Implementasi: Screenshot + penjelasan setiap fitur yang dibangun
- 3.3.5 Pengujian: Hasil pengujian (minimal black box testing)
- 3.3.6 Hasil dan Dampak: Manfaat nyata yang diberikan proyek kepada mitra

3.4 KENDALA DAN SOLUSI
- Tabel: No | Kendala yang Ditemui | Solusi yang Diambil | Hasil`,

        bab4: `PANDUAN BAB IV — PENUTUP (Laporan KPI UHN):

4.1 KESIMPULAN
- Kesimpulan harus menjawab rumusan masalah di Bab I secara langsung
- Rangkuman dari hasil capstone project (apa yang berhasil dibangun dan manfaatnya)
- Kompetensi/skill baru yang diperoleh selama KPI
- Sertakan data konkret (jika ada pengukuran dampak di mitra)

4.2 SARAN
- Saran untuk mitra industri: pengembangan lanjutan dari proyek yang dikerjakan
- Saran untuk Sekolah Vokasi UHN: rekomendasi perbaikan program KPI
- Minimal 3 saran yang spesifik dan konstruktif`,
      }
    };

    const docRules = guidelines[docType.toLowerCase()];
    if (!docRules) {
      return `Dokumen tipe '${docType}' tidak dikenal. Gunakan: 'proposal', 'skripsi', atau 'kpi'.`;
    }

    const rule = docRules[section.toLowerCase()];
    if (rule) {
      return rule;
    }
    return `Tidak ada panduan khusus untuk bagian '${section}' pada dokumen '${docType}'. Ikuti format penulisan ilmiah standar UHN.`;
  },
  {
    name: "check_uhn_guidelines",
    description: "Mengecek aturan resmi dan panduan detail dari Buku Pedoman Akademik Universitas Harkat Negeri (UHN) sebelum menyusun kerangka atau isi Bab. Gunakan ini SEBELUM menulis setiap bab.",
    schema: z.object({
      docType: z.enum(["proposal", "skripsi", "kpi"]).describe("Tipe dokumen akademik yang sedang dikerjakan."),
      section: z.enum(["umum", "bab1", "bab2", "bab3", "bab4", "bab5"]).describe("Bagian panduan yang ingin dicek. Gunakan 'umum' untuk format dokumen secara keseluruhan."),
    }),
  }
);

// 4. Tool: Integrasi dan Pembaca Konten Repositori GitHub Mahasiswa
export const fetchGitHubContentTool = tool(
  async ({ repoUrl, path }) => {
    try {
      console.log(`[MCP TOOL] Mengambil data GitHub: ${repoUrl}, Path: ${path || "root"}`);
      
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) {
        return "Format URL GitHub tidak valid. Harus seperti: https://github.com/username/repo-name";
      }

      const owner = match[1];
      const repo = match[2].replace(/\.git$/, "");
      const targetPath = path ? path.replace(/^\//, "") : "";

      const headers: Record<string, string> = {
        "User-Agent": "UHNAcademicAgent/1.0",
        "Accept": "application/vnd.github.v3+json"
      };
      if (process.env.GITHUB_TOKEN) {
        headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
      }

      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`,
        { headers }
      );

      if (!res.ok) {
        if (res.status === 404) {
          return `Direktori atau berkas '${targetPath || "root"}' tidak ditemukan di repositori ini.`;
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (body.message?.toLowerCase().includes("rate limit") || body.message?.toLowerCase().includes("forbidden")) {
            return `Batas akses API GitHub (Rate Limit) terlampaui atau akses dibatasi. Harap konfigurasikan \`GITHUB_TOKEN\` di file \`.env.local\` Anda untuk membuka limitasi ini.`;
          }
        }
        return `Gagal menghubungi API GitHub. Kode Status: ${res.status}`;
      }

      const data = await res.json();

      if (Array.isArray(data)) {
        const fileList = data.map((item: any) => {
          return `- [${item.type.toUpperCase()}] ${item.path} ${item.type === "file" ? `(${item.size} bytes)` : ""}`;
        }).join("\n");
        
        return `Daftar direktori/file di path '${targetPath || "root"}':\n${fileList}\n\nJika ingin membaca isi salah satu berkas, panggil tool ini lagi dengan path yang sesuai.`;
      }

      if (data.type === "file" && data.content) {
        const fileContent = Buffer.from(data.content, "base64").toString("utf-8");
        const maxLength = 6000;
        if (fileContent.length > maxLength) {
          return `Isi file '${targetPath}' (Dipotong):\n\`\`\`\n${fileContent.substring(0, maxLength)}\n\n... [File dipotong]\n\`\`\``;
        }
        return `Isi file '${targetPath}':\n\`\`\`\n${fileContent}\n\`\`\``;
      }

      return "Tipe konten repositori tidak dikenali.";
    } catch (error: any) {
      return `Kesalahan saat membaca repositori GitHub: ${error.message}`;
    }
  },
  {
    name: "fetch_github_content",
    description: "Mengambil daftar file di direktori atau membaca isi baris kode program dari repositori GitHub mahasiswa secara langsung.",
    schema: z.object({
      repoUrl: z.string().describe("Tautan penuh repositori GitHub (contoh: 'https://github.com/irsyad/barbershop-bot')."),
      path: z.string().optional().describe("Path file atau folder di dalam repositori. Jika dikosongkan, akan membaca root directory."),
    }),
  }
);
