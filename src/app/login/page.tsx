"use client";

import { useState } from "react";
import { auth } from "../../lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);

      // 管理者か受講生かで遷移先を分岐
      if (email.includes("admin")) {
        router.push("/admin");
      } else {
        router.push("/student");
      }
    } catch (err: any) {
      setError("メールアドレスまたはパスワードが正しくありません。");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl shadow-gray-200 p-10 border border-gray-100">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[#f38118] rounded-2xl flex items-center justify-center text-white font-black text-xl mx-auto mb-6 shadow-lg shadow-orange-100">
            EC
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tighter">
            講座ログイン
          </h1>
          <p className="text-gray-400 text-sm mt-3 font-medium">
            学習を再開してスキルを磨きましょう
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-[0.2em] px-1">
              メールアドレス
            </label>
            <input
              type="email"
              className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-orange-200 outline-none transition text-gray-800 font-bold placeholder-gray-300"
              placeholder="example@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-[0.2em] px-1">
              パスワード
            </label>
            <input
              type="password"
              className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-orange-200 outline-none transition text-gray-800 font-bold placeholder-gray-300"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-500 text-xs font-bold p-4 rounded-2xl text-center animate-shake">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gray-900 hover:bg-black text-white font-black py-5 rounded-2xl shadow-xl transition-all active:scale-95 text-sm tracking-widest"
          >
            ログインする
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-gray-50 text-center">
          <p className="text-sm text-gray-500">はじめての方はこちらから</p>
          <Link
            href="/register"
            className="inline-block mt-2 text-[#f38118] font-black hover:underline underline-offset-4"
          >
            新規アカウント作成（無料）
          </Link>
        </div>
      </div>
    </div>
  );
}
