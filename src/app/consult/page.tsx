"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TextareaAutosize from "react-textarea-autosize";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { 
  Send, FileText, Loader2, Download, BookOpen, MessageSquare, 
  Paperclip, Code, Link as LinkIcon, Plus, X, Globe, 
  GraduationCap, Home, ChevronRight, Edit3, Check, Copy,
  RotateCcw, PanelLeftOpen, PanelLeftClose, Sparkles
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type SessionItem = { id: string; label: string; createdAt: string; messages: Message[]; phase: string; docType: string; };

const PHASE_STEPS = ["KONSULTASI AWAL", "OUTLINING DOKUMEN", "DRAFTING LANJUTAN", "FINALISASI"];
const PHASE_MAP: Record<string, string> = {
  "KONSULTASI AWAL": "IDEATION",
  "OUTLINING DOKUMEN": "OUTLINING",
  "DRAFTING LANJUTAN": "DRAFTING",
  "FINALISASI": "FINALIZATION",
};

const WELCOME_MSG: Message = {
  role: "assistant",
  content: "Halo! Saya **Asisten Akademik UHN** 🎓\n\nSaya dilatih khusus untuk membantu Anda menyusun 3 dokumen utama kampus:\n1. **Proposal Skripsi**\n2. **Skripsi**\n3. **Laporan Kerja Praktik Industri (KPI)**\n\nSilakan isi identitas tugas akhir Anda dengan klik tombol **Pilih Tipe Dokumen** di bawah agar panduan disesuaikan dengan Buku Pedoman UHN.\n\nApa yang ingin kita diskusikan hari ini?"
};

export default function ConsultPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Session / History
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarMobile, setSidebarMobile] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState("KONSULTASI AWAL");
  const [showMobileDraft, setShowMobileDraft] = useState(false);

  // Workspace
  const [workspaceContent, setWorkspaceContent] = useState("");
  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
  const [workspaceCopied, setWorkspaceCopied] = useState(false);

  // Document identity
  const [docType, setDocType] = useState<"proposal" | "skripsi" | "kpi">("proposal");
  const [nama, setNama] = useState("");
  const [nim, setNim] = useState("");
  const [judul, setJudul] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [gitRepo, setGitRepo] = useState("");
  const [attachedDocs, setAttachedDocs] = useState<Array<{ name: string; content: string }>>([]);
  const [tempAttachedDocs, setTempAttachedDocs] = useState<Array<{ name: string; content: string }>>([]);
  const [attachedUrl, setAttachedUrl] = useState("");
  const [verifiedSources, setVerifiedSources] = useState<Array<{ title: string; url: string; status: string }>>([]);

  // Modal state
  const [activeModal, setActiveModal] = useState<"doctype" | "document" | "github" | "url" | null>(null);
  const [tempNama, setTempNama] = useState("");
  const [tempNim, setTempNim] = useState("");
  const [tempJudul, setTempJudul] = useState("");
  const [tempCompany, setTempCompany] = useState("");
  const [tempDocType, setTempDocType] = useState<"proposal" | "skripsi" | "kpi">("proposal");
  const [tempDocName, setTempDocName] = useState("");
  const [tempDocContent, setTempDocContent] = useState("");
  const [tempGitRepo, setTempGitRepo] = useState("");
  const [tempAttachedUrl, setTempAttachedUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || null);
        setUserId(user.id);
      }
    });
  }, []);

  // ─── Load sessions from localStorage ─────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem("uhn_sessions");
    if (raw) {
      try {
        const parsed: SessionItem[] = JSON.parse(raw);
        setSessions(parsed);
      } catch {}
    }
    // Load identity
    const sN = localStorage.getItem("uhn_student_nama");
    const sNim = localStorage.getItem("uhn_student_nim");
    const sJ = localStorage.getItem("uhn_student_judul");
    const sDt = localStorage.getItem("uhn_student_doctype");
    const sCo = localStorage.getItem("uhn_student_company");
    const sGit = localStorage.getItem("uhn_student_gitrepo");
    if (sN) { setNama(sN); setTempNama(sN); }
    if (sNim) { setNim(sNim); setTempNim(sNim); }
    if (sJ) { setJudul(sJ); setTempJudul(sJ); }
    if (sDt) { const dt = sDt as "proposal"|"skripsi"|"kpi"; setDocType(dt); setTempDocType(dt); }
    if (sCo) { setCompanyName(sCo); setTempCompany(sCo); }
    if (sGit) { setGitRepo(sGit); setTempGitRepo(sGit); }
  }, []);

  // ─── Auto-sync workspace with latest DRAF ────────────────────────────────
  const { latestDraft, isDraftStreaming } = useMemo(() => {
    let accumulated = "";
    let streaming = false;
    messages.forEach((m) => {
      if (m.role === "assistant") {
        const matches = [...m.content.matchAll(/<DRAF>([\s\S]*?)<\/DRAF>/g)];
        if (matches.length > 0) {
          accumulated = matches[matches.length - 1][1];
        } else if (m.content.includes("<DRAF>")) {
          accumulated = m.content.substring(m.content.indexOf("<DRAF>") + 6);
          streaming = true;
        }
      }
    });
    return { latestDraft: accumulated, isDraftStreaming: streaming };
  }, [messages]);

  // Sync workspace when AI produces new draft (only if not editing)
  useEffect(() => {
    if (latestDraft && !isEditingWorkspace) {
      setWorkspaceContent(latestDraft);
    }
  }, [latestDraft]);

  const cleanChatContent = (text: string) => {
    let cleaned = text.replace(/<DRAF>[\s\S]*?<\/DRAF>/g, "\n\n*[✏️ Draf dikirim ke Lembar Kerja...]*\n\n");
    cleaned = cleaned.replace(/<STATE_UPDATE>[\s\S]*?<\/STATE_UPDATE>/g, "");
    return cleaned;
  };

  useEffect(() => {
    if (!showMobileDraft) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showMobileDraft]);

  // ─── Session helpers ──────────────────────────────────────────────────────
  const saveSessions = (updated: SessionItem[]) => {
    setSessions(updated);
    localStorage.setItem("uhn_sessions", JSON.stringify(updated));
  };

  const createNewSession = () => {
    const id = `sess_${Date.now()}`;
    const label = judul ? judul.substring(0, 45) : `Sesi ${new Date().toLocaleDateString("id-ID")}`;
    const newSession: SessionItem = {
      id,
      label,
      createdAt: new Date().toISOString(),
      messages: [WELCOME_MSG],
      phase: "KONSULTASI AWAL",
      docType,
    };
    const updated = [newSession, ...sessions].slice(0, 20); // max 20 sessions
    saveSessions(updated);
    setActiveSessionId(id);
    setMessages([WELCOME_MSG]);
    setWorkspaceContent("");
    setCurrentPhase("KONSULTASI AWAL");
    setIsEditingWorkspace(false);
    setSidebarMobile(false);
  };

  const loadSession = (session: SessionItem) => {
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setCurrentPhase(session.phase);
    setDocType(session.docType as "proposal"|"skripsi"|"kpi");
    // Re-extract workspace
    let ws = "";
    session.messages.forEach(m => {
      if (m.role === "assistant") {
        const matches = [...m.content.matchAll(/<DRAF>([\s\S]*?)<\/DRAF>/g)];
        if (matches.length > 0) ws = matches[matches.length - 1][1];
      }
    });
    setWorkspaceContent(ws);
    setIsEditingWorkspace(false);
    setSidebarMobile(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    saveSessions(updated);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([WELCOME_MSG]);
      setWorkspaceContent("");
    }
  };

  // Auto-save current session
  const autoSaveSession = useCallback((msgs: Message[], phase: string, overrideSessionId?: string) => {
    const targetSessionId = overrideSessionId || activeSessionId;
    if (!targetSessionId) return;
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id !== targetSessionId) return s;
        const label = judul ? judul.substring(0, 45) : s.label;
        return { ...s, messages: msgs, phase, label };
      });
      localStorage.setItem("uhn_sessions", JSON.stringify(updated));
      return updated;
    });
  }, [activeSessionId, judul]);

  // ─── Export DOCX ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      setIsLoading(true);
      // Use editable workspace content for export
      const exportMessages = workspaceContent
        ? [...messages, { role: "assistant" as const, content: `<DRAF>${workspaceContent}</DRAF>` }]
        : messages;

      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: exportMessages, docType, nama, nim, judul, companyName }),
      });

      const ct = response.headers.get("content-type") || "";
      if (!ct.includes("application/vnd")) {
        const err = await response.json().catch(() => ({ error: "Gagal mengekspor" }));
        throw new Error(err.error || "Gagal mengekspor dokumen");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nama && nim ? `${docType}_${nim}_${nama.split(" ")[0]}.docx` : "Draf_UHN.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("❌ " + (err.message || "Gagal mengunduh dokumen Word."));
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Modals ───────────────────────────────────────────────────────────────
  const handleOpenModal = (type: "doctype" | "document" | "github" | "url") => {
    if (type === "document") {
      setTempAttachedDocs([...attachedDocs]);
      setTempDocName(""); setTempDocContent("");
    }
    setActiveModal(type);
  };

  const handleSaveDocType = () => {
    setDocType(tempDocType); setNama(tempNama); setNim(tempNim);
    setJudul(tempJudul); setCompanyName(tempCompany);
    localStorage.setItem("uhn_student_doctype", tempDocType);
    localStorage.setItem("uhn_student_nama", tempNama);
    localStorage.setItem("uhn_student_nim", tempNim);
    localStorage.setItem("uhn_student_judul", tempJudul);
    localStorage.setItem("uhn_student_company", tempCompany);
    setActiveModal(null);
  };

  const handleSaveDocument = () => {
    let finalDocs = [...tempAttachedDocs];
    if (tempDocName.trim() && tempDocContent.trim()) {
      finalDocs.push({ name: tempDocName.trim(), content: tempDocContent.trim() });
    }
    setAttachedDocs(finalDocs);
    setActiveModal(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (tempAttachedDocs.length + files.length > 15) {
      setParseError("Batas maksimal 15 berkas.");
      return;
    }
    setIsParsing(true); setParseError("");
    try {
      const results: Array<{ name: string; content: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/parse-file", { method: "POST", body: fd });
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const raw = await res.text();
          console.error("[parse-file]", res.status, raw.substring(0, 200));
          throw new Error(res.status === 401 ? "Sesi habis. Refresh dan login ulang." : `Server error (${res.status}) pada "${file.name}".`);
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Gagal membaca: ${file.name}`);
        results.push({ name: data.name || file.name, content: data.text });
      }
      setTempAttachedDocs(prev => [...prev, ...results]);
    } catch (err: any) {
      setParseError(err.message || "Gagal mengunggah berkas.");
    } finally {
      setIsParsing(false);
      e.target.value = "";
    }
  };

  const handleSaveGithub = () => {
    setGitRepo(tempGitRepo);
    localStorage.setItem("uhn_student_gitrepo", tempGitRepo);
    setActiveModal(null);
  };

  const handleSaveUrl = () => { setAttachedUrl(tempAttachedUrl); setActiveModal(null); };

  const removeIndividualDoc = (idx: number) => setAttachedDocs(prev => prev.filter((_, i) => i !== idx));
  const removeAttachment = (type: "doc" | "url" | "github" | "identity") => {
    if (type === "doc") { setAttachedDocs([]); }
    else if (type === "url") { setAttachedUrl(""); setTempAttachedUrl(""); }
    else if (type === "github") { setGitRepo(""); setTempGitRepo(""); localStorage.removeItem("uhn_student_gitrepo"); }
    else {
      setNama(""); setNim(""); setJudul(""); setCompanyName("");
      ["uhn_student_nama","uhn_student_nim","uhn_student_judul","uhn_student_company"].forEach(k => localStorage.removeItem(k));
    }
  };

  // ─── Phase change ─────────────────────────────────────────────────────────
  const handlePhaseChange = async (uiPhase: string) => {
    const agentPhase = PHASE_MAP[uiPhase];
    if (!agentPhase) return;
    try {
      setIsLoading(true);
      const res = await fetch("/api/chat/phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: agentPhase }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memperbarui fase.");
      setCurrentPhase(uiPhase);
      setMessages(prev => {
        const updated = [...prev, {
          role: "assistant" as const,
          content: `*[🔄 Fase bimbingan diubah ke **${uiPhase}**. Silakan ajukan instruksi untuk fase ini.]*`
        }];
        autoSaveSession(updated, uiPhase);
        return updated;
      });
    } catch (err: any) {
      alert("Error: " + (err.message || "Gagal mengubah fase."));
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Submit chat ──────────────────────────────────────────────────────────
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    let currentSessionId = activeSessionId;
    // Auto-create session on first message
    if (!currentSessionId) {
      currentSessionId = `sess_${Date.now()}`;
      const label = judul ? judul.substring(0, 45) : `Sesi ${new Date().toLocaleDateString("id-ID")}`;
      const newSess: SessionItem = { id: currentSessionId, label, createdAt: new Date().toISOString(), messages: [WELCOME_MSG], phase: "KONSULTASI AWAL", docType };
      const updated = [newSess, ...sessions].slice(0, 20);
      saveSessions(updated);
      setActiveSessionId(currentSessionId);
    }

    const userMessage = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      let formatted = "";
      // Selalu sertakan informasi mahasiswa terupdate agar agen selalu tahu identitas dan repo terbaru
      formatted += `<informasi_mahasiswa>\nNama: ${nama || "Belum diisi"}\nNIM: ${nim || "Belum diisi"}\nTipe Dokumen: ${docType.toUpperCase()}\nJudul: ${judul || "Belum diisi"}\n${docType === "kpi" && companyName ? `Mitra Industri: ${companyName}` : ""}\n${gitRepo ? `GitHub Repo: ${gitRepo}` : ""}\n</informasi_mahasiswa>\n\n`;

      attachedDocs.forEach(doc => {
        formatted += `<lampiran_dokumen name="${doc.name}">\n${doc.content}\n</lampiran_dokumen>\n\n`;
      });
      if (attachedUrl) formatted += `<lampiran_url url="${attachedUrl}">\nReferensi: ${attachedUrl}\n</lampiran_url>\n\n`;
      formatted += userMessage;

      const updatedHistory = [
        ...messages.slice(0, -1),
        { role: "user" as const, content: formatted }
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedHistory }),
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let finalPhase = currentPhase;

      while (!done) {
        const { value, done: rd } = await reader.read();
        done = rd;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last.role === "assistant") {
              let content = last.content + chunk;
              if (content.includes("[SISTEM: RESET_STREAM]")) {
                content = content.split("[SISTEM: RESET_STREAM]").pop() || "";
              }
              if (content.includes("[SISTEM: JUDUL DISETUJUI]")) {
                setCurrentPhase("OUTLINING DOKUMEN");
                finalPhase = "OUTLINING DOKUMEN";
              }
              if (content.includes("[SISTEM: BAB 1 SELESAI]")) {
                setCurrentPhase("DRAFTING LANJUTAN");
                finalPhase = "DRAFTING LANJUTAN";
              }
              if (content.includes("[SISTEM: BAB 3 SELESAI]")) {
                setCurrentPhase("FINALISASI");
                finalPhase = "FINALISASI";
              }
              next[next.length - 1] = { ...last, content };
            }
            return next;
          });
        }
      }

      // Auto-save after response
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.content.includes("<STATE_UPDATE>")) {
          try {
            const jsonStart = last.content.indexOf("<STATE_UPDATE>") + 14;
            const jsonEnd = last.content.lastIndexOf("</STATE_UPDATE>");
            if (jsonEnd > jsonStart) {
              const jsonStr = last.content.substring(jsonStart, jsonEnd).trim();
              const update = JSON.parse(jsonStr);
              
              if (update.current_phase) {
                const uiPhases: Record<string, string> = {
                  "IDEATION": "KONSULTASI AWAL",
                  "OUTLINING": "OUTLINING DOKUMEN",
                  "DRAFTING": "DRAFTING LANJUTAN",
                  "FINALIZATION": "FINALISASI"
                };
                const uiPhase = uiPhases[update.current_phase];
                if (uiPhase) {
                  setCurrentPhase(uiPhase);
                  finalPhase = uiPhase;
                }
              }
              
              if (update.locked_title) {
                setJudul(update.locked_title);
                setTempJudul(update.locked_title);
                localStorage.setItem("uhn_student_judul", update.locked_title);
              }
              
              if (Array.isArray(update.sources)) {
                setVerifiedSources(update.sources);
              }
            }
          } catch (e) {
            console.error("Error parsing state update from assistant:", e);
          }
        }
        autoSaveSession(prev, finalPhase, currentSessionId);
        return prev;
      });
    } catch (error) {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: "\n`❌ Koneksi terputus. Coba kirim ulang pesan Anda.`" };
        }
        return next;
      });
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const copyWorkspace = async () => {
    await navigator.clipboard.writeText(workspaceContent);
    setWorkspaceCopied(true);
    setTimeout(() => setWorkspaceCopied(false), 2000);
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────
  const phaseIndex = PHASE_STEPS.indexOf(currentPhase);

  return (
    <div className="flex flex-col h-screen bg-[#FDFBF7] text-black font-sans selection:bg-[#7A1B22] selection:text-white overflow-hidden">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#7A1B22] border-b-4 border-black z-20 shrink-0">
        <div className="flex items-center gap-3">
          {/* Sidebar toggle */}
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="hidden lg:flex items-center justify-center w-8 h-8 bg-white/20 hover:bg-white/30 border border-white/40 text-white transition-colors"
            title={showSidebar ? "Sembunyikan riwayat" : "Tampilkan riwayat"}
          >
            {showSidebar ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
          </button>
          <button
            onClick={() => setSidebarMobile(s => !s)}
            className="lg:hidden flex items-center justify-center w-8 h-8 bg-white/20 hover:bg-white/30 border border-white/40 text-white transition-colors"
          >
            <PanelLeftOpen size={16}/>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white border-2 border-black flex items-center justify-center shadow-[2px_2px_0_#000]">
              <FileText size={18} className="text-[#7A1B22]"/>
            </div>
            <div>
              <h1 className="text-lg font-black text-white uppercase leading-none tracking-tight">UHN Academic</h1>
              <p className="text-[9px] font-bold text-[#F5E6D3] uppercase tracking-widest leading-none">Asisten Akademik AI</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/">
            <button className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase bg-white hover:bg-[#F5E6D3] text-[#7A1B22] border-2 border-black shadow-[2px_2px_0_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all">
              <Home size={13}/> Linter &amp; Cover
            </button>
          </Link>

          <button
            onClick={() => setShowMobileDraft(s => !s)}
            className="lg:hidden p-2 bg-white/20 hover:bg-white/30 border border-white/40 text-white transition-colors"
          >
            {showMobileDraft ? <MessageSquare size={16}/> : <BookOpen size={16}/>}
          </button>

          <button
            onClick={handleExport}
            disabled={isLoading || !workspaceContent}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase bg-[#F5E6D3] hover:bg-white text-black border-2 border-black shadow-[2px_2px_0_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-40"
          >
            <Download size={13}/> Unduh DOCX
          </button>



          {/* Phase selector */}
          <select
            value={currentPhase}
            onChange={e => handlePhaseChange(e.target.value)}
            disabled={isLoading}
            className="hidden md:block px-2 py-1.5 text-[10px] font-black uppercase bg-[#FFC107] text-black border-2 border-black shadow-[2px_2px_0_#000] focus:outline-none cursor-pointer disabled:opacity-50"
          >
            {PHASE_STEPS.map(p => <option key={p}>{p}</option>)}
          </select>

          {userEmail && (
            <div className="relative group">
              <button className="w-8 h-8 bg-white/20 hover:bg-white/30 border border-white/40 text-white font-black text-sm flex items-center justify-center transition-colors" title={userEmail}>
                {userEmail.charAt(0).toUpperCase()}
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#FDFBF7] border-2 border-black shadow-[4px_4px_0_#000] hidden group-hover:block z-30">
                <div className="px-3 py-2 border-b border-black text-[10px] font-mono text-gray-500 truncate">{userEmail}</div>
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-xs font-black uppercase text-red-700 hover:bg-red-50 transition-colors">Keluar</button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── PHASE PROGRESS BAR ──────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center bg-[#F5E6D3] border-b-2 border-black px-6 py-2 gap-0 shrink-0">
        {PHASE_STEPS.map((step, i) => {
          const done = i < phaseIndex;
          const active = i === phaseIndex;
          return (
            <React.Fragment key={step}>
              <div className="flex items-center gap-1.5">
                <div className={`w-5 h-5 flex items-center justify-center border-2 border-black text-[10px] font-black transition-colors ${done ? "bg-[#22c55e] text-white" : active ? "bg-[#7A1B22] text-white" : "bg-white text-gray-400"}`}>
                  {done ? <Check size={11}/> : i + 1}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${active ? "text-[#7A1B22]" : done ? "text-green-700" : "text-gray-400"}`}>{step}</span>
              </div>
              {i < PHASE_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 transition-colors ${done ? "bg-green-500" : "bg-gray-300"}`}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ── HISTORY SIDEBAR (desktop) ──────────────────────────────────── */}
        {showSidebar && (
          <aside className="hidden lg:flex flex-col w-56 xl:w-64 bg-[#1c1917] border-r-4 border-black shrink-0 overflow-hidden">
            <div className="p-3 border-b-2 border-[#333]">
              <button
                onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#7A1B22] hover:bg-[#5A000D] text-white border-2 border-black shadow-[2px_2px_0_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all text-xs font-black uppercase"
              >
                <Plus size={14}/> Sesi Baru
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {sessions.length === 0 && (
                <p className="text-[10px] text-gray-500 text-center px-4 mt-4 font-mono">Belum ada riwayat sesi.</p>
              )}
              {sessions.map(sess => (
                <div
                  key={sess.id}
                  onClick={() => loadSession(sess)}
                  className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors border-l-2 ${activeSessionId === sess.id ? "bg-[#7A1B22]/30 border-[#7A1B22]" : "border-transparent hover:bg-white/5"}`}
                >
                  <MessageSquare size={13} className="text-gray-400 mt-0.5 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-200 truncate leading-tight">{sess.label}</p>
                    <p className="text-[9px] text-gray-500 font-mono mt-0.5">{new Date(sess.createdAt).toLocaleDateString("id-ID")}</p>
                  </div>
                  <button
                    onClick={e => deleteSession(sess.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 transition-all shrink-0"
                  >
                    <X size={11}/>
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* ── MOBILE SIDEBAR OVERLAY ─────────────────────────────────────── */}
        {sidebarMobile && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setSidebarMobile(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#1c1917] border-r-4 border-black z-50 flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-3 border-b-2 border-[#333]">
                <button onClick={createNewSession} className="w-full flex items-center justify-center gap-2 py-2 bg-[#7A1B22] text-white border-2 border-black text-xs font-black uppercase">
                  <Plus size={14}/> Sesi Baru
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {sessions.map(sess => (
                  <div key={sess.id} onClick={() => loadSession(sess)} className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer border-l-2 ${activeSessionId === sess.id ? "bg-[#7A1B22]/30 border-[#7A1B22]" : "border-transparent"}`}>
                    <MessageSquare size={13} className="text-gray-400 mt-0.5 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-gray-200 truncate">{sess.label}</p>
                      <p className="text-[9px] text-gray-500 font-mono">{new Date(sess.createdAt).toLocaleDateString("id-ID")}</p>
                    </div>
                    <button onClick={e => deleteSession(sess.id, e)} className="p-0.5 text-gray-500 hover:text-red-400"><X size={11}/></button>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}

        {/* ── LEFT PANE: CHAT ─────────────────────────────────────────────── */}
        <main className={`flex-1 flex flex-col relative border-r-0 lg:border-r-4 border-black bg-[#FDFBF7] ${showMobileDraft ? "hidden lg:flex" : "flex"}`}>

          {/* Mobile toolbar */}
          <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-[#F5E6D3] border-b-2 border-black gap-2 shrink-0">
            <select value={currentPhase} onChange={e => handlePhaseChange(e.target.value)} disabled={isLoading}
              className="px-2 py-1 text-[10px] font-black uppercase bg-[#FFC107] text-black border-2 border-black focus:outline-none disabled:opacity-50 flex-1">
              {PHASE_STEPS.map(p => <option key={p}>{p}</option>)}
            </select>
            <button onClick={handleExport} disabled={!workspaceContent || isLoading}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase bg-white border-2 border-black disabled:opacity-40">
              <Download size={12}/> Unduh
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-2xl mx-auto space-y-5">
              {messages.map((msg, idx) => {
                if (msg.role === "assistant" && !msg.content.trim()) return null;
                return (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 bg-[#7A1B22] border-2 border-black flex items-center justify-center mr-2 mt-1 shrink-0 shadow-[2px_2px_0_#000]">
                        <Sparkles size={13} className="text-white"/>
                      </div>
                    )}
                    <div className={`max-w-[90%] p-4 text-sm border-2 border-black shadow-[3px_3px_0_#000] ${
                      msg.role === "user"
                        ? "bg-[#7A1B22] text-white"
                        : "bg-white text-black"
                    }`}>
                      <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black prose-pre:text-white prose-a:text-blue-700 prose-a:font-bold prose-strong:font-black prose-headings:font-black">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.role === "assistant" ? cleanChatContent(msg.content) : msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isLoading && messages[messages.length - 1]?.content === "" && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 bg-[#7A1B22] border-2 border-black flex items-center justify-center mr-2 shrink-0 shadow-[2px_2px_0_#000]">
                    <Sparkles size={13} className="text-white animate-pulse"/>
                  </div>
                  <div className="p-4 bg-white border-2 border-black shadow-[3px_3px_0_#000] flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-[#7A1B22]"/>
                    <span className="text-xs font-bold font-mono text-gray-600">Dosen AI sedang berpikir...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef}/>
            </div>
          </div>

          {/* Input area */}
          <footer className="p-4 bg-[#F5E6D3] border-t-4 border-black shrink-0">
            <div className="max-w-2xl mx-auto flex flex-col gap-2">

              {/* Verified Sources (Strict JSON CrossRef Reference Cards) */}
              {verifiedSources.length > 0 && (
                <div className="flex flex-col gap-1 p-2.5 bg-green-50 border-2 border-green-600 shadow-[2px_2px_0_#059669] mb-1">
                  <span className="text-[10px] font-black font-mono text-green-800 uppercase flex items-center gap-1">
                    📖 Referensi Terverifikasi (Lock):
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {verifiedSources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase bg-white text-green-700 hover:bg-green-100 border-2 border-green-600 px-2.5 py-1 shadow-[1px_1px_0_#059669] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                      >
                        <span>{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachment chips */}
              {(nama || attachedDocs.length > 0 || attachedUrl || gitRepo) && (
                <div className="flex flex-wrap gap-1.5">
                  {nama && (
                    <div className="flex items-center gap-1 text-xs bg-white border-2 border-black px-2 py-0.5 shadow-[1px_1px_0_#000] font-bold">
                      <GraduationCap size={11} className="text-[#7A1B22]"/>
                      <span>{docType.toUpperCase()}: {nama.split(" ")[0]} ({nim})</span>
                      <button onClick={() => removeAttachment("identity")} className="ml-0.5 text-red-500 hover:text-red-700"><X size={9}/></button>
                    </div>
                  )}
                  {attachedDocs.map((doc, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs bg-white border-2 border-black px-2 py-0.5 shadow-[1px_1px_0_#000] font-bold">
                      <Paperclip size={11} className="text-[#7A1B22]"/>
                      <span className="truncate max-w-[100px]">{doc.name}</span>
                      <button onClick={() => removeIndividualDoc(i)} className="ml-0.5 text-red-500 hover:text-red-700"><X size={9}/></button>
                    </div>
                  ))}
                  {gitRepo && (
                    <div className="flex items-center gap-1 text-xs bg-white border-2 border-black px-2 py-0.5 shadow-[1px_1px_0_#000] font-bold">
                      <Code size={11} className="text-[#7A1B22]"/>
                      <span className="truncate max-w-[110px]">{gitRepo.replace("https://github.com/","")}</span>
                      <button onClick={() => removeAttachment("github")} className="ml-0.5 text-red-500 hover:text-red-700"><X size={9}/></button>
                    </div>
                  )}
                  {attachedUrl && (
                    <div className="flex items-center gap-1 text-xs bg-white border-2 border-black px-2 py-0.5 shadow-[1px_1px_0_#000] font-bold">
                      <LinkIcon size={11} className="text-[#7A1B22]"/>
                      <span className="truncate max-w-[110px]">{attachedUrl}</span>
                      <button onClick={() => removeAttachment("url")} className="ml-0.5 text-red-500 hover:text-red-700"><X size={9}/></button>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col bg-white border-2 border-black shadow-[4px_4px_0_#000] focus-within:-translate-y-0.5 transition-transform">
                <TextareaAutosize
                  minRows={2} maxRows={6}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  placeholder="Ketik instruksi atau pertanyaan tugas akhir Anda..."
                  className="w-full p-4 bg-transparent text-black font-medium placeholder-gray-400 focus:outline-none resize-none text-sm leading-relaxed"
                />
                <div className="flex justify-between items-center px-4 pb-3 pt-1 border-t border-gray-100">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleOpenModal("document")} className="p-1.5 text-gray-400 hover:text-[#7A1B22] hover:bg-gray-100 transition-colors rounded-sm" title="Lampirkan Dokumen"><Paperclip size={17}/></button>
                    <button type="button" onClick={() => handleOpenModal("github")} className="p-1.5 text-gray-400 hover:text-[#7A1B22] hover:bg-gray-100 transition-colors rounded-sm" title="Hubungkan GitHub"><Code size={17}/></button>
                    <button type="button" onClick={() => handleOpenModal("url")} className="p-1.5 text-gray-400 hover:text-[#7A1B22] hover:bg-gray-100 transition-colors rounded-sm" title="Tautkan URL"><LinkIcon size={17}/></button>
                    <div className="w-px h-4 bg-gray-200 self-center mx-1"/>
                    <button type="button" onClick={() => handleOpenModal("doctype")} className="flex items-center gap-1 text-[10px] font-black font-mono text-[#7A1B22] px-1.5 py-1 hover:bg-gray-100 border border-transparent hover:border-black transition-all rounded-sm">
                      <Plus size={12}/>{nama ? `${docType.toUpperCase()} — ${nama.split(" ")[0]}` : "Atur Identitas"}
                    </button>
                  </div>
                  <button type="submit" disabled={!input.trim() || isLoading}
                    className="px-4 py-2 bg-[#7A1B22] hover:bg-[#5A000D] disabled:bg-gray-200 disabled:text-gray-400 text-white border-2 border-black font-black uppercase shadow-[2px_2px_0_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center">
                    {isLoading ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}
                  </button>
                </div>
              </form>
              <p className="text-center text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                AI dapat keliru · Verifikasi pedoman UHN secara mandiri
              </p>
            </div>
          </footer>
        </main>

        {/* ── RIGHT PANE: WORKSPACE ───────────────────────────────────────── */}
        <aside className={`${showMobileDraft ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-[440px] xl:w-[500px] bg-white shrink-0`}>

          {/* Workspace header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#F5E6D3] border-b-4 border-black shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[#7A1B22]"/>
              <h2 className="text-xs font-black uppercase tracking-widest">Lembar Kerja</h2>
              {isDraftStreaming && (
                <span className="flex items-center gap-1 text-[9px] font-black text-[#7A1B22] animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7A1B22] inline-block"/>MENULIS...
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {workspaceContent && (
                <>
                  <button onClick={copyWorkspace} className="flex items-center gap-1 px-2 py-1 text-[10px] font-black bg-white hover:bg-gray-100 border-2 border-black shadow-[1px_1px_0_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all">
                    {workspaceCopied ? <Check size={11} className="text-green-600"/> : <Copy size={11}/>}
                    {workspaceCopied ? "Tersalin!" : "Salin"}
                  </button>
                  <button
                    onClick={() => setIsEditingWorkspace(e => !e)}
                    className={`flex items-center gap-1 px-2 py-1 text-[10px] font-black border-2 border-black shadow-[1px_1px_0_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all ${isEditingWorkspace ? "bg-green-400 text-black" : "bg-white hover:bg-gray-100"}`}
                  >
                    {isEditingWorkspace ? <><Check size={11}/>Selesai Edit</> : <><Edit3 size={11}/>Edit</>}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Workspace content */}
          <div className="flex-1 overflow-hidden relative">
            {workspaceContent ? (
              isEditingWorkspace ? (
                /* EDIT MODE: editable textarea */
                <textarea
                  value={workspaceContent}
                  onChange={e => setWorkspaceContent(e.target.value)}
                  className="w-full h-full p-6 font-mono text-sm leading-relaxed text-black bg-[#FFFEF5] focus:outline-none resize-none border-0"
                  spellCheck={false}
                  placeholder="Edit draf di sini..."
                />
              ) : (
                /* VIEW MODE: rendered markdown */
                <div className="h-full overflow-y-auto p-6 scroll-smooth">
                  <div className="prose prose-sm xl:prose-base max-w-none text-justify prose-headings:font-black prose-headings:font-serif prose-p:leading-[1.9] prose-p:font-serif prose-p:text-[14px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {workspaceContent}
                    </ReactMarkdown>
                  </div>
                  {isDraftStreaming && (
                    <div className="mt-6 p-4 bg-[#FDFBF7] border-4 border-black shadow-[4px_4px_0_#000] animate-pulse flex items-center gap-3 font-sans">
                      <Loader2 size={16} className="animate-spin text-[#7A1B22] shrink-0"/>
                      <span className="text-xs font-black uppercase tracking-wider text-[#7A1B22]">Dosen AI sedang menulis draf...</span>
                    </div>
                  )}
                </div>
              )
            ) : isLoading ? (
              <div className="flex flex-col h-full items-center justify-center text-gray-500 p-10 text-center">
                <Loader2 size={40} className="text-[#7A1B22] animate-spin mb-4"/>
                <p className="font-bold uppercase tracking-widest text-xs animate-pulse">Merancang draf naskah...</p>
                <span className="text-[10px] font-mono text-gray-400 mt-2">Memverifikasi pedoman UHN...</span>
              </div>
            ) : (
              <div className="flex flex-col h-full items-center justify-center text-gray-300 p-10 text-center">
                <FileText size={44} className="mb-4"/>
                <p className="font-bold uppercase tracking-widest text-xs text-gray-400 leading-loose">
                  Belum ada draf.<br/>Mulai diskusi hingga AI mulai<br/>menghasilkan konten bab.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ─── MODALS ──────────────────────────────────────────────────────────── */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveModal(null)}>
          <div className="bg-[#FDFBF7] border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md flex flex-col gap-4 font-sans text-black" onClick={e => e.stopPropagation()}>
            
            {/* Modal: DOCTYPE */}
            {activeModal === "doctype" && (
              <div className="p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b-2 border-black pb-3">
                  <h3 className="text-base font-black uppercase text-[#7A1B22]">Identitas Naskah</h3>
                  <button onClick={() => setActiveModal(null)} className="p-1 hover:bg-gray-200"><X size={18}/></button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase font-mono text-gray-600">Tipe Dokumen</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["proposal", "skripsi", "kpi"] as const).map(t => (
                      <button key={t} type="button" onClick={() => setTempDocType(t)}
                        className={`py-2 text-xs font-black font-mono border-2 border-black shadow-[2px_2px_0_#000] uppercase ${tempDocType === t ? "bg-[#7A1B22] text-white" : "bg-white hover:bg-gray-100"}`}>
                        {t === "kpi" ? "KPI" : t}
                      </button>
                    ))}
                  </div>
                </div>
                {[
                  { label: "Nama Lengkap", ph: "M. IRSYAD FACHRYANTO", val: tempNama, fn: setTempNama },
                  { label: "NIM", ph: "23090111", val: tempNim, fn: setTempNim },
                ].map(f => (
                  <div key={f.label} className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase font-mono text-gray-600">{f.label}</label>
                    <input type="text" placeholder={f.ph} value={f.val} onChange={e => f.fn(e.target.value)} className="w-full px-3 py-2 border-2 border-black font-semibold text-sm focus:outline-none focus:border-[#7A1B22]"/>
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase font-mono text-gray-600">Judul Laporan / Skripsi</label>
                  <textarea placeholder="IMPLEMENTASI SISTEM ANTREAN..." rows={2} value={tempJudul} onChange={e => setTempJudul(e.target.value)} className="w-full px-3 py-2 border-2 border-black font-semibold text-sm focus:outline-none focus:border-[#7A1B22] resize-none"/>
                </div>
                {tempDocType === "kpi" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase font-mono text-gray-600">Nama Mitra Industri</label>
                    <input type="text" placeholder="PT. TELKOM INDONESIA Tbk." value={tempCompany} onChange={e => setTempCompany(e.target.value)} className="w-full px-3 py-2 border-2 border-black font-semibold text-sm focus:outline-none focus:border-[#7A1B22]"/>
                  </div>
                )}
                <button onClick={handleSaveDocType} className="w-full py-2.5 bg-[#7A1B22] hover:bg-[#5A000D] text-white border-2 border-black font-black uppercase shadow-[2px_2px_0_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all">
                  Simpan Identitas
                </button>
              </div>
            )}

            {/* Modal: DOCUMENT */}
            {activeModal === "document" && (
              <div className="p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b-2 border-black pb-3">
                  <h3 className="text-base font-black uppercase text-[#7A1B22]">Lampirkan Dokumen</h3>
                  <button onClick={() => setActiveModal(null)} className="p-1 hover:bg-gray-200"><X size={18}/></button>
                </div>
                <div className="border-2 border-dashed border-black bg-gray-50 hover:bg-gray-100 transition-colors text-center cursor-pointer p-4">
                  <input type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={handleFileUpload} className="hidden" id="modal-file" disabled={isParsing}/>
                  <label htmlFor="modal-file" className="cursor-pointer block font-bold text-xs uppercase">
                    {isParsing ? "⏳ Membaca berkas..." : "📁 Unggah PDF / DOCX / TXT / MD (max 15)"}
                  </label>
                </div>
                {parseError && <p className="text-[10px] text-red-600 font-bold font-mono">{parseError}</p>}
                {tempAttachedDocs.length > 0 && (
                  <div className="border-2 border-black p-2 bg-white max-h-32 overflow-y-auto flex flex-col gap-1">
                    <span className="text-[9px] font-black font-mono text-gray-500 uppercase">Berkas ({tempAttachedDocs.length}/15)</span>
                    {tempAttachedDocs.map((d, i) => (
                      <div key={i} className="flex justify-between items-center text-xs font-mono p-1 bg-gray-50 border border-gray-200">
                        <span className="truncate max-w-[260px]">{d.name}</span>
                        <button onClick={() => setTempAttachedDocs(prev => prev.filter((_, j) => j !== i))} className="text-red-500 font-black text-[10px] ml-2">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t-2 border-black pt-3 flex flex-col gap-2">
                  <span className="text-[9px] font-black uppercase font-mono text-gray-500">Atau tambah manual:</span>
                  <input type="text" placeholder="Judul/nama dokumen" value={tempDocName} onChange={e => setTempDocName(e.target.value)} className="w-full px-3 py-2 border-2 border-black text-xs font-semibold focus:outline-none"/>
                  <textarea placeholder="Tempel teks dokumen di sini..." rows={3} value={tempDocContent} onChange={e => setTempDocContent(e.target.value)} className="w-full px-3 py-2 border-2 border-black text-[10px] font-mono focus:outline-none resize-none"/>
                  <button type="button" onClick={() => {
                    if (tempDocName.trim() && tempDocContent.trim() && tempAttachedDocs.length < 15) {
                      setTempAttachedDocs(prev => [...prev, { name: tempDocName.trim(), content: tempDocContent.trim() }]);
                      setTempDocName(""); setTempDocContent(""); setParseError("");
                    }
                  }} disabled={!tempDocName.trim() || !tempDocContent.trim()} className="py-1.5 bg-white border-2 border-black text-xs font-black uppercase disabled:opacity-40 hover:bg-gray-100">
                    + Tambah ke Daftar
                  </button>
                </div>
                <button onClick={handleSaveDocument} disabled={tempAttachedDocs.length === 0 || isParsing} className="w-full py-2.5 bg-[#7A1B22] hover:bg-[#5A000D] disabled:bg-gray-200 disabled:text-gray-400 text-white border-2 border-black font-black uppercase shadow-[2px_2px_0_#000] transition-all">
                  Lampirkan ({tempAttachedDocs.length} berkas)
                </button>
              </div>
            )}

            {/* Modal: GITHUB */}
            {activeModal === "github" && (
              <div className="p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b-2 border-black pb-3">
                  <h3 className="text-base font-black uppercase text-[#7A1B22]">Integrasi GitHub</h3>
                  <button onClick={() => setActiveModal(null)} className="p-1 hover:bg-gray-200"><X size={18}/></button>
                </div>
                <p className="text-xs text-gray-500 font-bold -mt-1">AI akan membaca kode program Anda dan menyesuaikan pembahasan Bab III/IV secara mendalam.</p>
                <div className="relative">
                  <Code size={15} className="absolute left-3 top-3 text-gray-400"/>
                  <input type="text" autoFocus placeholder="https://github.com/username/repo" value={tempGitRepo} onChange={e => setTempGitRepo(e.target.value)} className="w-full pl-9 pr-3 py-2 border-2 border-black font-semibold text-sm focus:outline-none focus:border-[#7A1B22]"/>
                </div>
                <button onClick={handleSaveGithub} className="w-full py-2.5 bg-[#7A1B22] hover:bg-[#5A000D] text-white border-2 border-black font-black uppercase shadow-[2px_2px_0_#000] transition-all">Hubungkan Repository</button>
              </div>
            )}

            {/* Modal: URL */}
            {activeModal === "url" && (
              <div className="p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b-2 border-black pb-3">
                  <h3 className="text-base font-black uppercase text-[#7A1B22]">Tautkan URL Referensi</h3>
                  <button onClick={() => setActiveModal(null)} className="p-1 hover:bg-gray-200"><X size={18}/></button>
                </div>
                <div className="relative">
                  <Globe size={15} className="absolute left-3 top-3 text-gray-400"/>
                  <input type="text" autoFocus placeholder="https://jurnal.or.id/artikel/..." value={tempAttachedUrl} onChange={e => setTempAttachedUrl(e.target.value)} className="w-full pl-9 pr-3 py-2 border-2 border-black font-semibold text-sm focus:outline-none focus:border-[#7A1B22]"/>
                </div>
                <button onClick={handleSaveUrl} className="w-full py-2.5 bg-[#7A1B22] hover:bg-[#5A000D] text-white border-2 border-black font-black uppercase shadow-[2px_2px_0_#000] transition-all">Simpan Link</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
