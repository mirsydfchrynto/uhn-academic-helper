"use client";

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        alert("Pendaftaran berhasil! Silakan login.")
        setIsSignUp(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/consult')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan otentikasi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5E6D3] flex items-center justify-center p-4 selection:bg-[#000000] selection:text-[#F5E6D3] font-sans">
      <div className="bg-[#FFFFFF] border-4 border-[#000000] shadow-[8px_8px_0px_0px_#000000] w-full max-w-md p-8 md:p-10 relative">
        <div className="absolute -top-6 -left-6 bg-[#7A1B22] text-[#FFFFFF] border-4 border-[#000000] px-4 py-2 font-black uppercase text-xl transform -rotate-2">
          UHN TEGAL
        </div>
        
        <h1 className="text-3xl md:text-4xl font-black mt-4 mb-2 uppercase">Masuk Gerbang</h1>
        <p className="font-bold text-gray-600 mb-8 text-sm md:text-base">Silakan masuk menggunakan email Anda untuk mengakses Asisten Akademik MCP.</p>
        
        {error && (
          <div className="bg-red-100 text-red-800 font-bold p-3 border-4 border-red-800 mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block font-black uppercase mb-2">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 bg-[#F5E6D3] border-4 border-[#000000] font-bold focus:outline-none focus:bg-[#FFFFFF] transition-colors"
              placeholder="email@anda.com"
            />
          </div>
          <div>
            <label className="block font-black uppercase mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 bg-[#F5E6D3] border-4 border-[#000000] font-bold focus:outline-none focus:bg-[#FFFFFF] transition-colors"
              placeholder="••••••••"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full p-4 mt-4 bg-[#06D6A0] hover:bg-[#05b586] text-[#000000] border-4 border-[#000000] font-black uppercase shadow-[4px_4px_0px_0px_#000000] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center"
          >
            {loading ? <Loader2 size={24} className="animate-spin" /> : (isSignUp ? 'DAFTAR SEKARANG' : 'MASUK KE SISTEM')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="font-bold text-sm uppercase underline hover:text-[#7A1B22]"
          >
            {isSignUp ? "Sudah punya akun? Masuk di sini" : "Belum punya akun? Daftar di sini"}
          </button>
        </div>
      </div>
    </div>
  )
}
