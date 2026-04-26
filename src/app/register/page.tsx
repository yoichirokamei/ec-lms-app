"use client";

import { useState } from "react";
import { auth, db } from "../../lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(""); // 名前用のステート
  const [error, setError] = useState("");
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Firebase Authでユーザー作成
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Firestoreに名前を含むユーザープロファイルを保存
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name, // ここで名前を保存
        email: email,
        earnedAmount: 0,
        progress: [],
        createdAt: new Date(),
      });

      router.push("/student");
    } catch (err: any) {
      setError("登録に失敗しました。既に使われているメールアドレスかもしれません。");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <h1 className="text-2xl font-black text-center mb-8 text-gray-800">新規アカウント作成</h1>
        
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Full Name</label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition text-black"
              placeholder="山田 太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Email Address</label>
            <input
              type="email"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition text-black"
              placeholder="example@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Password</label>
            <input
              type="password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition text-black"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
          
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg transition active:scale-95"
          >
            登録して学習を始める
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          既にアカウントをお持ちの方は{" "}
          <Link href="/login" className="text-blue-600 font-bold hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}