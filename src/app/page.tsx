'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface LinterError {
  type: 'pronoun' | 'abbreviation' | 'citation' | 'system';
  message: string;
  line: number;
  context: string;
}

interface AuditResults {
  valid: boolean;
  metrics: {
    wordCount: number;
    charCount: number;
    errorCount: number;
    citationCount: number;
  };
  errors: LinterError[];
}

export default function Home() {
  // Config state - loaded from localStorage only (NEVER hardcode API keys)
  const [apiKey, setApiKey] = useState('');
  const [activeTab, setActiveTab] = useState<'audit' | 'humanizer' | 'generator'>('audit');

  // Input states
  const [docType, setDocType] = useState<'proposal' | 'skripsi' | 'kpi'>('proposal');
  const [nama, setNama] = useState('');
  const [nim, setNim] = useState('');
  const [judul, setJudul] = useState('');
  const [textInput, setTextInput] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Status & Output states
  const [loading, setLoading] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditResults | null>(null);
  const [humanizedText, setHumanizedText] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API Key and student details from LocalStorage on mount
  // Load API Key and student details from LocalStorage on mount (run once)
  useEffect(() => {
    const savedKey = localStorage.getItem('UHN_GEMINI_API_KEY');
    if (savedKey) {
      setApiKey(savedKey);
    }

    const savedNama = localStorage.getItem("uhn_student_nama");
    const savedNim = localStorage.getItem("uhn_student_nim");
    const savedJudul = localStorage.getItem("uhn_student_judul");
    const savedDocType = localStorage.getItem("uhn_student_doctype");
    if (savedNama) setNama(savedNama);
    if (savedNim) setNim(savedNim);
    if (savedJudul) setJudul(savedJudul);
    if (savedDocType) setDocType(savedDocType as 'proposal' | 'skripsi' | 'kpi');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync state changes back to LocalStorage
  useEffect(() => {
    localStorage.setItem("uhn_student_nama", nama);
  }, [nama]);

  useEffect(() => {
    localStorage.setItem("uhn_student_nim", nim);
  }, [nim]);

  useEffect(() => {
    localStorage.setItem("uhn_student_judul", judul);
  }, [judul]);

  useEffect(() => {
    localStorage.setItem("uhn_student_doctype", docType);
  }, [docType]);

  // Save API Key to LocalStorage
  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('UHN_GEMINI_API_KEY', key);
    showNotification('API Key berhasil disimpan.', 'success');
  };

  const showNotification = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage(null);
    }, 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      showNotification(`Berkas ${e.target.files[0].name} terpilih.`, 'info');
    }
  };

  // 1. Call Audit/Linter API
  const handleAudit = async () => {
    setLoading(true);
    setAuditResults(null);
    try {
      let response;

      if (file) {
        // Form Data for File Upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('docType', docType);

        response = await fetch('/api/audit', {
          method: 'POST',
          body: formData,
        });
      } else {
        // JSON Body for direct Text Input
        if (!textInput.trim()) {
          showNotification('Masukkan draf teks atau unggah berkas terlebih dahulu.', 'error');
          setLoading(false);
          return;
        }

        response = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textInput, docType }),
        });
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal memproses audit naskah.');
      }

      setAuditResults(data);
      if (data.errors.length === 0) {
        showNotification('Naskah lolos audit! 0 kesalahan terdeteksi.', 'success');
      } else {
        showNotification(`Audit selesai. Terdeteksi ${data.errors.length} kesalahan format.`, 'error');
      }
    } catch (error) {
      const err = error as Error;
      showNotification(err.message || 'Terjadi kesalahan sistem.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2. Call Humanize API
  const handleHumanize = async () => {
    if (!textInput.trim()) {
      showNotification('Masukkan teks AI yang ingin di-humanize terlebih dahulu.', 'error');
      return;
    }

    if (!apiKey) {
      showNotification('Kunci API Gemini dibutuhkan untuk menggunakan fitur ini.', 'error');
      return;
    }

    setLoading(true);
    setHumanizedText('');
    try {
      const response = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textInput,
          model: 'gemini-2.5-pro',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal melakukan humanisasi teks.');
      }

      setHumanizedText(data.text);
      showNotification('Teks berhasil di-humanize! 100% gaya penulisan natural.', 'success');
    } catch (error) {
      const err = error as Error;
      showNotification(err.message || 'Terjadi kesalahan sistem.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 3. Call Generate Word Document API
  const handleGenerate = async () => {
    if (!nama || !nim || !judul) {
      showNotification('Lengkapi nama, nim, dan judul tugas akhir terlebih dahulu.', 'error');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('docType', docType);
      formData.append('nama', nama);
      formData.append('nim', nim);
      formData.append('judul', judul);

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal membuat berkas Word.');
      }

      // Download file stream
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docType}_cover_${nim}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showNotification('Berkas Word resmi berhasil diunduh!', 'success');
    } catch (error) {
      const err = error as Error;
      showNotification(err.message || 'Terjadi kesalahan sistem.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('Teks disalin ke papan klip.', 'success');
  };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header Banner in Neo-Brutalism Style */}
      <header className="neo-box p-6 bg-[var(--uhn-crimson)] text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="neo-badge bg-[var(--neo-yellow)] text-black font-extrabold border-2 border-black">
              SEKOLAH VOKASI
            </span>
            <span className="text-sm font-bold tracking-widest uppercase text-yellow-200">
              UHN TEGAL
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight font-sans text-black leading-none drop-shadow-sm">
            UHN ACADEMIC HELPER
          </h1>
          <p className="text-sm font-bold text-gray-900 mt-2 font-mono">
            Format Linter, AI Humanizer, & Template Generator Resmi
          </p>
        </div>
        
        {/* Settings Area / API Key config */}
        <div className="neo-box p-4 bg-white text-black max-w-xs md:max-w-md flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider font-mono">
            Config: Gemini API Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="AI Studio API Key"
              value={apiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
              className="neo-input text-xs py-1"
            />
          </div>
          <span className="text-[10px] text-gray-500 font-mono">
            {apiKey ? '✅ API Key terpasang (Siap digunakan).' : '⚠️ Kunci dibutuhkan untuk fitur Humanizer.'}
          </span>
        </div>
      </header>

      {/* Notification Toast */}
      {message && (
        <div className="fixed bottom-4 right-4 z-50 neo-box p-4 flex items-center gap-2 max-w-sm"
          style={{
            backgroundColor: message.type === 'success' ? '#22c55e' : message.type === 'error' ? '#ef4444' : '#3b82f6',
            color: '#fff'
          }}
        >
          <span className="font-extrabold uppercase font-mono">{message.type === 'success' ? 'SUCCESS:' : message.type === 'error' ? 'ERROR:' : 'INFO:'}</span>
          <span className="text-sm font-bold font-sans">{message.text}</span>
        </div>
      )}

      {/* Tab Selectors */}
      <div className="flex flex-wrap gap-2 md:gap-4">
        <button
          onClick={() => setActiveTab('audit')}
          className={`neo-btn text-sm ${activeTab === 'audit' ? 'bg-[var(--uhn-crimson)] text-white' : 'bg-white text-black'}`}
        >
          🔍 1. Audit Format Linter
        </button>
        <button
          onClick={() => setActiveTab('humanizer')}
          className={`neo-btn text-sm ${activeTab === 'humanizer' ? 'bg-[var(--neo-yellow)] text-black' : 'bg-white text-black'}`}
        >
          ✨ 2. Humanize AI Text
        </button>
        <button
          onClick={() => setActiveTab('generator')}
          className={`neo-btn text-sm ${activeTab === 'generator' ? 'bg-[var(--uhn-crimson)] text-white' : 'bg-white text-black'}`}
        >
          📝 3. Generate Word Cover
        </button>
        <Link href="/consult">
          <button
            className="neo-btn text-sm bg-[#FFC107] hover:bg-[#E5AD06] text-black font-extrabold border-3 border-black shadow-[4px_4px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
          >
            💬 4. Konsultasi AI (Bimbingan)
          </button>
        </Link>
      </div>

      {/* Main Panel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Inputs (DYNAMIC BASED ON TAB) */}
        <div className="neo-box p-6 bg-white md:col-span-7 flex flex-col gap-4">
          
          {/* TAB 1: AUDIT INPUTS */}
          {activeTab === 'audit' && (
            <>
              <div className="flex justify-between items-center border-b-3 border-black pb-2">
                <h2 className="text-xl font-black uppercase tracking-tight font-sans">
                  Unggah Naskah Draf
                </h2>
                <span className="neo-badge bg-[var(--vokasi-blue)] text-white">Linter Mode</span>
              </div>
              
              <p className="text-xs text-gray-500 font-bold -mt-2">
                Format Linter akan memindai berkas Anda terhadap kata ganti orang terlarang, singkatan non-baku, dan keselarasan referensi pustaka IEEE.
              </p>

              {/* File Upload Zone */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase font-mono">1. Pilih Berkas Laporan (.docx, .pdf, .txt, .md)</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-3 border-dashed border-black bg-gray-50 p-8 text-center cursor-pointer hover:bg-gray-100 transition-colors neo-box-interactive"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".docx,.pdf,.txt,.md"
                    className="hidden"
                  />
                  <span className="block font-bold text-md font-sans">
                    {file ? `📄 Berkas: ${file.name}` : '📁 Klik untuk Memilih Berkas Laporan'}
                  </span>
                  <span className="text-[10px] text-gray-500 block mt-1 font-mono">
                    Maksimal ukuran 10MB. Mendukung konversi teks DOCX/PDF instan.
                  </span>
                </div>
                {file && (
                  <button 
                    onClick={() => setFile(null)} 
                    className="text-xs font-bold text-red-600 hover:underline text-left"
                  >
                    [X] Hapus Berkas Unggahan
                  </button>
                )}
              </div>

              <div className="text-center font-bold text-xs font-mono text-gray-400">--- ATAU ---</div>

              {/* Text Area Input */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold uppercase font-mono">2. Tempel Teks Paragraf Naskah</label>
                <textarea
                  placeholder="Tempel draf bab/paragraf naskah skripsi Anda di sini..."
                  rows={10}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="neo-input text-sm font-mono"
                  disabled={!!file}
                />
                {file && (
                  <span className="text-[10px] text-red-500 font-mono">
                    * Input teks dinonaktifkan karena Anda menggunakan metode unggah berkas.
                  </span>
                )}
              </div>

              <button
                onClick={handleAudit}
                disabled={loading}
                className="neo-btn neo-btn-primary w-full text-center mt-2"
              >
                {loading ? '⏳ Sedang Memindai...' : '🔍 Mulai Audit Format Dokumen'}
              </button>
            </>
          )}

          {/* TAB 2: HUMANIZE INPUTS */}
          {activeTab === 'humanizer' && (
            <>
              <div className="flex justify-between items-center border-b-3 border-black pb-2">
                <h2 className="text-xl font-black uppercase tracking-tight font-sans">
                  Parafrase Anti-AI
                </h2>
                <span className="neo-badge bg-[var(--neo-yellow)] text-black">Humanizer Mode</span>
              </div>
              
              <p className="text-xs text-gray-500 font-bold -mt-2">
                Masukkan teks hasil AI di sini untuk di-parafrase secara natural dengan gaya akademik mahasiswa Indonesia, mempertahankan kutipan IEEE.
              </p>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold uppercase font-mono">Tempel Teks Draf Asli AI</label>
                <textarea
                  placeholder="Tempel draf tulisan AI Anda di sini..."
                  rows={12}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="neo-input text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 border-2 border-black">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase font-mono">Engine Model</span>
                  <span className="text-xs font-bold text-gray-700">Vertex AI Gemini 2.5 Pro (Enterprise)</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase font-mono">Model Cadangan (Failover)</span>
                  <span className="text-xs font-bold text-green-700">Aktif (Vertex AI Gemini 2.5 Flash)</span>
                </div>
              </div>

              <button
                onClick={handleHumanize}
                disabled={loading}
                className="neo-btn neo-btn-secondary w-full text-center mt-2"
              >
                {loading ? '⏳ Sedang Memproses AI...' : '✨ Jalankan Humanizer (Hapus Jejak AI)'}
              </button>
            </>
          )}

          {/* TAB 3: GENERATE WORD INPUTS */}
          {activeTab === 'generator' && (
            <>
              <div className="flex justify-between items-center border-b-3 border-black pb-2">
                <h2 className="text-xl font-black uppercase tracking-tight font-sans">
                  Identitas Dokumen Cover
                </h2>
                <span className="neo-badge bg-[var(--uhn-crimson)] text-white">Generator Mode</span>
              </div>
              
              <p className="text-xs text-gray-500 font-bold -mt-2">
                Isi formulir di bawah ini untuk menyuntikkan data cover ke template Word resmi Sekolah Vokasi UHN.
              </p>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase font-mono">1. Pilih Jenis Dokumen</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDocType('proposal')}
                    className={`neo-btn text-xs py-2 ${docType === 'proposal' ? 'bg-[var(--uhn-crimson)] text-white' : 'bg-gray-100 text-black'}`}
                  >
                    PROPOSAL SKRIPSI
                  </button>
                  <button
                    onClick={() => setDocType('skripsi')}
                    className={`neo-btn text-xs py-2 ${docType === 'skripsi' ? 'bg-[var(--uhn-crimson)] text-white' : 'bg-gray-100 text-black'}`}
                  >
                    SKRIPSI
                  </button>
                  <button
                    onClick={() => setDocType('kpi')}
                    className={`neo-btn text-xs py-2 ${docType === 'kpi' ? 'bg-[var(--uhn-crimson)] text-white' : 'bg-gray-100 text-black'}`}
                  >
                    LAPORAN KPI
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase font-mono">2. Nama Lengkap Mahasiswa</label>
                  <input
                    type="text"
                    placeholder="M. IRSYAD FACHRYANTO"
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    className="neo-input text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase font-mono">3. NIM Mahasiswa</label>
                  <input
                    type="text"
                    placeholder="23090111"
                    value={nim}
                    onChange={(e) => setNim(e.target.value)}
                    className="neo-input text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold uppercase font-mono">4. Judul Tugas Akhir / Laporan</label>
                <textarea
                  placeholder="IMPLEMENTASI SISTEM ANTREAN HYBRID PADA FEBRIAN BARBERSHOP..."
                  rows={3}
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  className="neo-input text-sm resize-none"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="neo-btn neo-btn-accent w-full text-center mt-2"
              >
                {loading ? '⏳ Membuat Berkas...' : '📝 Unduh Halaman Cover Resmi (.docx)'}
              </button>


            </>
          )}

        </div>

        {/* RIGHT COLUMN: Outputs/Results (DYNAMIC BASED ON TAB) */}
        <div className="neo-box p-6 bg-[var(--background)] md:col-span-5 flex flex-col gap-4 min-h-[520px]">
          
          <h2 className="text-xl font-black uppercase tracking-tight border-b-3 border-black pb-2 font-sans">
            Pratinjau & Laporan
          </h2>

          {loading && (
            <div className="flex flex-col items-center justify-center flex-grow py-12 gap-2">
              <div className="w-12 h-12 border-4 border-black border-t-yellow-400 animate-spin neo-box rounded-full"></div>
              <span className="font-bold text-xs uppercase tracking-widest font-mono text-gray-600 mt-2">
                Memproses data Anda...
              </span>
            </div>
          )}

          {/* TAB 1: AUDIT OUTPUT VIEW */}
          {!loading && activeTab === 'audit' && (
            <div className="flex flex-col gap-4 flex-grow">
              {!auditResults ? (
                <div className="flex flex-col justify-between flex-grow">
                  <div className="neo-box p-4 bg-white text-xs">
                    <span className="font-bold text-sm block border-b-2 border-black pb-1 mb-2">Poin Pemindaian Linter:</span>
                    <ul className="flex flex-col gap-2 list-disc list-inside font-mono text-gray-600">
                      <li>Kata Ganti Orang Pertama/Kedua (Prohibited)</li>
                      <li>Singkatan Non-Baku Bahasa Indonesia (e.g. yg, dll)</li>
                      <li>Integritas Rujukan Sitasi IEEE</li>
                      <li>Deteksi Kutipan Hantu (Ghost Citations)</li>
                    </ul>
                  </div>
                  <div className="text-center py-6 text-gray-400 font-mono text-[10px]">
                    Menunggu masukan berkas/teks untuk menjalankan pemindaian.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 flex-grow">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="neo-box p-3 bg-white text-center">
                      <span className="block text-[9px] font-bold text-gray-500 uppercase font-mono">Kata / Karakter</span>
                      <span className="text-sm font-extrabold font-mono">{auditResults.metrics.wordCount} / {auditResults.metrics.charCount}</span>
                    </div>
                    <div className="neo-box p-3 bg-white text-center">
                      <span className="block text-[9px] font-bold text-gray-500 uppercase font-mono">Total Sitasi</span>
                      <span className="text-sm font-extrabold font-mono">{auditResults.metrics.citationCount}</span>
                    </div>
                  </div>

                  {/* Status Card */}
                  {auditResults.errors.length === 0 ? (
                    <div className="neo-box p-4 bg-[var(--neo-green)] text-white text-center neo-pulse">
                      <h3 className="text-xl font-black uppercase text-black">LOLOS AUDIT</h3>
                      <p className="text-[10px] font-bold text-black mt-1 font-mono">
                        Naskah Anda siap diserahkan ke dosen!
                      </p>
                    </div>
                  ) : (
                    <div className="neo-box p-4 bg-[var(--uhn-crimson)] text-white text-center">
                      <h3 className="text-lg font-black uppercase">REVISI DETECTED</h3>
                      <p className="text-[10px] font-bold text-red-200 mt-1 font-mono">
                        Ditemukan {auditResults.errors.length} pelanggaran penulisan.
                      </p>
                    </div>
                  )}

                  {/* Errors Scroll list */}
                  <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                    {auditResults.errors.map((err, idx) => (
                      <div key={idx} className="neo-box p-3 bg-white text-xs flex flex-col gap-1 border-l-8 border-l-red-600">
                        <div className="flex justify-between font-mono font-bold text-gray-500">
                          <span>[LINE {err.line}] [{err.type.toUpperCase()}]</span>
                        </div>
                        <p className="font-bold text-red-700 text-[11px]">{err.message}</p>
                        <span className="bg-gray-100 p-1 font-mono text-[9px] text-gray-600 block rounded mt-1">
                          {err.context}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: HUMANIZE OUTPUT VIEW */}
          {!loading && activeTab === 'humanizer' && (
            <div className="flex flex-col gap-4 flex-grow">
              {!humanizedText ? (
                <div className="flex flex-col justify-between flex-grow">
                  <div className="neo-box p-4 bg-white text-xs">
                    <span className="font-bold text-sm block border-b-2 border-black pb-1 mb-2">Metodologi Anti-AI:</span>
                    <ul className="flex flex-col gap-2 list-disc list-inside font-mono text-gray-600">
                      <li>Pencegahan Significance Inflation</li>
                      <li>Penghapusan Notability Name-Dropping</li>
                      <li>Penurunan Frekuensi Participle Fluff</li>
                      <li>Modifikasi Nilai Perplexity & Burstiness</li>
                    </ul>
                  </div>
                  <div className="text-center py-6 text-gray-400 font-mono text-[10px]">
                    Hasil humanisasi teks akan ditampilkan di sini.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 flex-grow">
                  <div className="flex justify-between items-center">
                    <span className="neo-badge bg-[var(--neo-green)] text-white font-extrabold">
                      Ready to copy
                    </span>
                    <button
                      onClick={() => copyToClipboard(humanizedText)}
                      className="neo-btn text-[10px] py-1 px-3 bg-white hover:bg-gray-100"
                    >
                      📋 Salin Teks
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={humanizedText}
                    rows={16}
                    className="neo-box p-3 bg-white text-xs font-mono w-full resize-none select-all focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GENERATOR PREVIEW VIEW */}
          {!loading && activeTab === 'generator' && (
            <div className="flex flex-col justify-between flex-grow">
              {/* Dynamic Neo-brutalism 2D Preview of the Cover */}
              <div className="neo-box p-4 bg-white border-4 border-black relative min-h-[360px] flex flex-col justify-between items-center text-center">
                
                {/* Header Kop Preview */}
                <div className="w-full text-[9px] font-bold font-mono border-b-2 border-black pb-2 mb-2">
                  KOP FORMULIR: SEKOLAH VOKASI - UNIVERSITAS HARKAT NEGERI
                </div>

                {/* Cover Main Content */}
                <div className="flex flex-col gap-2 my-auto px-2">
                  <span className="text-[10px] font-extrabold uppercase text-[var(--uhn-crimson)]">
                    {docType === 'proposal' ? 'PROPOSAL SKRIPSI' : docType === 'skripsi' ? 'SKRIPSI' : 'LAPORAN KERJA PRAKTIK INDUSTRI'}
                  </span>
                  
                  <h3 className="text-xs font-black uppercase text-black line-clamp-4 leading-tight max-w-[280px]">
                    {judul || 'JUDUL DRAF LAPORAN TUGAS AKHIR ANDA AKAN DITAMPILKAN DI SINI'}
                  </h3>

                  <div className="w-12 h-12 bg-[var(--vokasi-blue)] border-2 border-black rounded-full mx-auto my-2 flex items-center justify-center text-white font-extrabold text-[10px]">
                    UHN
                  </div>

                  <div className="flex flex-col text-[10px] font-bold font-mono text-gray-700">
                    <span>Oleh:</span>
                    <span className="text-black font-extrabold underline">{nama || 'NAMA LENGKAP MAHASISWA'}</span>
                    <span>NIM. {nim || 'NIM MAHASISWA'}</span>
                  </div>
                </div>

                {/* Footer Preview */}
                <div className="w-full border-t-2 border-black pt-2 mt-2 text-[8px] font-bold font-mono uppercase">
                  PROGRAM STUDI SARJANA TERAPAN TEKNIK INFORMATIKA<br/>
                  UNIVERSITAS HARKAT NEGERI TEGAL - 2026
                </div>
              </div>

              <div className="text-[10px] text-gray-500 font-mono text-center mt-2">
                * Tampilan di atas adalah representasi visual cover halaman Word resmi.
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <footer className="neo-box p-4 bg-white text-center text-xs font-bold font-mono">
        Universitas Harkat Negeri © 2026 - Sekolah Vokasi (Sarjana Terapan Teknik Informatika)
      </footer>
    </main>
  );
}
