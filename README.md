# UHN Academic Helper — Sekolah Vokasi UHN Tegal

UHN Academic Helper adalah asisten akademik berbasis kecerdasan buatan (AI) spesialis untuk Sekolah Vokasi Universitas Harkat Negeri (UHN) Tegal. Aplikasi ini dirancang khusus untuk memandu mahasiswa tingkat D3/D4 Teknik Informatika dalam menyusun 3 dokumen tugas akhir utama (Proposal Skripsi, Skripsi, dan Laporan Kerja Praktik Industri) agar sepenuhnya selaras dengan Buku Pedoman resmi UHN.

---

## 🚀 Fitur Utama & Keunggulan Arsitektur

Aplikasi ini dibangun menggunakan arsitektur modern berstandar tinggi yang selaras dengan konsep **Twelve-Factor App**:

### 📁 Pilar 1: Real-time File Upload & Text Parser
* Ekstraksi dokumen instan untuk berkas `.pdf`, `.docx`, `.txt`, dan `.md` secara aman di sisi server menggunakan API route `/api/parse-file`.
* Kompatibel dengan drag-and-drop file uploader di dialog modal bimbingan chat consult. Teks hasil ekstraksi otomatis terisi ke form untuk divalidasi sebelum dikirim sebagai konteks ke obrolan AI.

### 🌐 Pilar 2: Active GitHub Repo Code Reader Tool
* Terintegrasi dengan tool LangGraph spesialis `fetch_github_content`.
* AI mampu menelusuri folder dan membaca langsung isi baris kode program repositori GitHub publik milik mahasiswa secara asinkron untuk mendiskusikan implementasi Bab 4 (Hasil Pembahasan) atau mengaudit kecocokan skema SQL database.

### 📄 Pilar 3: Unified Page Word Export (Double XML Grafting)
* Menyelesaikan masalah pemisahan draf chat dengan halaman cover resmi.
* Menggunakan teknik **Double XML Grafting** pada `/api/export`:
  1. Halaman Cover resmi UHN dikompilasi dinamis dari template master `.docx` menggunakan `docxtemplater`.
  2. Halaman Lembar Persetujuan/Pengesahan resmi UHN disisipkan di halaman kedua lengkap dengan data mahasiswa otomatis.
  3. Baris draf obrolan chat dikonversi ke XML docx asli lalu digabungkan di halaman ketiga dan seterusnya dengan page breaks dinamis.
* Output akhir adalah dokumen tunggal berfont Times New Roman 12pt dengan margin akademik Indonesia standar (Kiri 4cm, Atas/Bawah/Kanan 3cm).

### ⚡ Pilar 4: DB Checkpointer Latency Optimization
* Koneksi checkpointer obrolan LangGraph PostgreSQL via Supabase IPv4 Pooler dioptimalkan secara asinkron pada tingkat modul load di `src/lib/agent/state.ts`.
* Menghilangkan jeda cold-start 1.5 - 2.5 detik pada hot-path obrolan `/api/chat` sehingga respons token pertama keluar kurang dari 100ms.

---

## 🛠️ Cara Menjalankan Aplikasi

### Prerequisites
Pastikan file konfigurasi lingkungan `.env.local` telah terisi variabel berikut:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_DB_URL=postgresql://postgres:password@pooler-address:5432/postgres
GEMINI_API_KEY=your-gemini-api-key
```

### 1. Jalankan Mode Development
Jalankan server pengembangan lokal menggunakan Next.js dev server:
```bash
npm run dev
```
Aplikasi dapat diakses melalui browser pada alamat [http://localhost:3000](http://localhost:3000).

### 2. Lakukan Kompilasi Build Produksi
Lakukan build optimal menggunakan Next.js dengan Turbopack untuk memastikan tidak ada kesalahan tipe data:
```bash
npm run build
```

### 3. Jalankan Suite Uji Coba E2E & Integrasi
Suite pengujian otomatis untuk memvalidasi API linter, humanizer, dan pembuat berkas Word:
```bash
node scripts/e2e-test-runner.js
```
*Script ini menggunakan binary Next.js lokal proyek secara aman untuk stabilitas penuh.*

---

## 🧪 Rincian Unit Pengujian E2E (5/5 Lulus)
* **TEST 1 (Kata Ganti Dilarang)**: Memvalidasi kemampuan linter mendeteksi kata terlarang "saya" dalam draf tulisan.
* **TEST 2 (False-Positive Protection)**: Menjamin bahwa kata kunci seperti "Penulis" yang berada di dalam baris tabel Markdown diabaikan dengan benar.
* **TEST 3 (Citation Check)**: Memastikan sitasi rujukan seperti `[4]` yang tidak terdaftar di daftar pustaka ditandai sebagai error.
* **TEST 4 (Gemini API Humanizer)**: Memastikan API humanizer memparafrase tulisan AI menjadi natural di bawah fallback model `gemini-2.5-flash`.
* **TEST 5 (MIME Word Generator)**: Memvalidasi integritas pengemasan output unduhan dokumen ber-MIME-type Word resmi.

---

## 🏛️ Identitas & Branding Kampus UHN
Aplikasi ini sepenuhnya diselaraskan dengan warna resmi institusi **UHN Crimson/Maroon (`#7a1b22`)** dan warna latar **Warm Cream/Off-White (`#FDFBF7`)** yang terinspirasi dari identitas bendera institusi, menjamin estetika premium Neo-Brutalist yang profesional.
