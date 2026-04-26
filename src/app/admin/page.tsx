"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const [students, setStudents] = useState<any[]>([]);
  const [curricula, setCurricula] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("total");
  const [pendingStudent, setPendingStudent] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [newItem, setNewItem] = useState({ chapter: "", section: "", title: "", reward: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !user.email?.includes("admin")) {
        router.push("/login");
      }
    });

    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubDocs = onSnapshot(q, (snapshot) => {
      const sData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStudents(sData);

      // 管理者を除き、開始日が未設定の受講生を承認待ちとして検出
      const unassigned = sData.find(
        (s: any) => !s.startDate && !s.email?.includes("admin")
      );
      setPendingStudent(unassigned ?? null);

      setLoading(false);
    });

    const qC = query(collection(db, "curriculums"), orderBy("createdAt", "asc"));
    const unsubCurricula = onSnapshot(qC, (snapshot) => {
      setCurricula(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubAuth();
      unsubDocs();
      unsubCurricula();
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const handleApprove = async (studentId: string, days: number) => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + days);

    await updateDoc(doc(db, "users", studentId), {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      status: "active",
    });
    setPendingStudent(null);
  };

  const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await addDoc(collection(db, "curriculums"), {
        ...newItem,
        reward: Number(newItem.reward),
        createdAt: serverTimestamp(),
      });
      setNewItem({ chapter: "", section: "", title: "", reward: 0 });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "curriculums", editingItem.id), {
        chapter: editingItem.chapter,
        section: editingItem.section,
        title: editingItem.title,
        reward: Number(editingItem.reward),
      });
      setEditingItem(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("このレッスンを削除しますか？")) return;
    await deleteDoc(doc(db, "curriculums", id));
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">読み込み中...</div>
    );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              EC
            </div>
            <h1 className="font-bold text-lg hidden md:block">管理者ダッシュボード</h1>
          </div>

          <nav className="flex bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setView("total")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "total" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              全体統計
            </button>
            <button
              type="button"
              onClick={() => setView("detail")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "detail" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              受講生詳細
            </button>
            <button
              type="button"
              onClick={() => setView("curriculum")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "curriculum" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              カリキュラム登録
            </button>
            <button
              type="button"
              onClick={() => setView("config")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "config" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              構成管理
            </button>
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="text-gray-500 text-sm font-bold hover:text-red-500 transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8">
        {/* 承認待ちアラート（管理者以外で startDate 未設定の場合のみ表示） */}
        {pendingStudent && (
          <div className="mb-8 bg-orange-50 border-2 border-orange-200 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse">
            <div>
              <p className="text-orange-800 font-bold text-lg">新着の受講生がいます！</p>
              <p className="text-orange-600 text-sm">
                {pendingStudent.email} さんの受講期間を設定してください。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleApprove(pendingStudent.id, 90)}
                className="bg-orange-500 text-white px-6 py-2 rounded-2xl font-bold shadow-lg hover:bg-orange-600"
              >
                90日間で承認
              </button>
              <button
                type="button"
                onClick={() => handleApprove(pendingStudent.id, 180)}
                className="bg-white text-orange-500 border-2 border-orange-500 px-6 py-2 rounded-2xl font-bold hover:bg-orange-50"
              >
                180日間で承認
              </button>
            </div>
          </div>
        )}

        {view === "total" && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">総報酬発生額</p>
                <p className="text-2xl font-black text-orange-600">¥127,500</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">スクール平均進捗</p>
                <p className="text-2xl font-black text-blue-600">84%</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">期間内完走率</p>
                <p className="text-2xl font-black text-green-500">100%</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">期限超過率</p>
                <p className="text-2xl font-black text-red-500">0%</p>
              </div>
            </div>

            <section className="bg-white rounded-[40px] shadow-sm border border-gray-100 p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-2 h-6 bg-orange-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-800">受講生進捗 & 期限管理</h2>
              </div>

              <div className="space-y-6">
                {students
                  .filter((s: any) => !s.email?.includes("admin"))
                  .map((student) => {
                    const today = new Date();
                    const end = student.endDate ? new Date(student.endDate) : null;
                    const diffTime = end ? end.getTime() - today.getTime() : 0;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const isExpired = diffDays < 0;

                    return (
                      <div
                        key={student.id}
                        className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 hover:bg-gray-50 rounded-2xl transition group border-b border-gray-50 last:border-0"
                      >
                        <div className="flex-1 min-w-0 mb-4 md:mb-0">
                          <p className="font-bold text-gray-800 truncate text-lg">
                            {student.name || "名前未設定"}
                          </p>
                          <p className="text-xs text-gray-400 font-medium">{student.email}</p>
                        </div>

                        <div className="flex-1 w-full md:max-w-xs px-0 md:px-8 mb-4 md:mb-0">
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                            <span>現在の進捗</span>
                            <span className="text-blue-600">{student.progress || 0}%</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-500 h-full transition-all duration-1000"
                              style={{ width: `${student.progress || 0}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-gray-400 mb-0.5">受講開始日</p>
                            <input
                              type="date"
                              title="受講開始日"
                              defaultValue={student.startDate}
                              className="text-xs font-bold text-gray-600 bg-gray-50 px-2 py-1 rounded-lg outline-none"
                              onChange={async (e) => {
                                await updateDoc(doc(db, "users", student.id), {
                                  startDate: e.target.value,
                                });
                              }}
                            />
                          </div>

                          <div
                            className={`px-4 py-2 rounded-2xl text-center min-w-[100px] ${isExpired ? "bg-red-50" : "bg-green-50"}`}
                          >
                            <p className="text-[10px] font-bold text-gray-400 mb-0.5">目標まで</p>
                            <p
                              className={`text-sm font-black ${isExpired ? "text-red-500" : "text-green-500"}`}
                            >
                              {isExpired ? "期限超過" : `あと ${diffDays}日`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          </div>
        )}

        {view === "detail" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {students
              .filter((s: any) => !s.email?.includes("admin"))
              .map((s) => (
                <div key={s.id} className="bg-white p-6 rounded-3xl border shadow-sm">
                  <p className="font-bold">{s.name || "名前未設定"}</p>
                  <p className="text-sm text-gray-400 mb-4">{s.email}</p>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/student/${s.id}`)}
                    className="w-full bg-gray-800 text-white py-2 rounded-xl text-sm font-bold hover:bg-black transition"
                  >
                    詳細レポートを表示
                  </button>
                </div>
              ))}
          </div>
        )}

        {view === "curriculum" && (
          <div className="space-y-6">
            {/* 新規追加フォーム */}
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-6 bg-orange-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-800">新規レッスン追加</h2>
              </div>
              <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="章（例: 第1章 EC基礎）"
                  value={newItem.chapter}
                  onChange={(e) => setNewItem({ ...newItem, chapter: e.target.value })}
                  required
                />
                <input
                  className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="セクション（例: ストア構築）"
                  value={newItem.section}
                  onChange={(e) => setNewItem({ ...newItem, section: e.target.value })}
                  required
                />
                <input
                  className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="レッスンタイトル"
                  value={newItem.title}
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  required
                />
                <input
                  type="number"
                  min={0}
                  className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="報酬（円）"
                  value={newItem.reward || ""}
                  onChange={(e) => setNewItem({ ...newItem, reward: Number(e.target.value) })}
                  required
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="md:col-span-2 bg-orange-500 text-white py-3 rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-50 transition"
                >
                  {isSaving ? "保存中..." : "+ レッスンを追加"}
                </button>
              </form>
            </div>

            {/* 登録済み一覧 */}
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-800">
                  登録済みカリキュラム（{curricula.length}件）
                </h2>
              </div>
              <div className="space-y-3">
                {curricula.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-8">
                    まだレッスンが登録されていません
                  </p>
                )}
                {curricula.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-orange-500 mb-0.5">
                        {item.chapter} / {item.section}
                      </p>
                      <p className="font-bold text-gray-800">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        報酬: ¥{item.reward?.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      <button
                        type="button"
                        onClick={() => setEditingItem({ ...item })}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-100 transition"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-sm font-bold hover:bg-red-100 transition"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === "config" && (
          <div className="bg-white p-10 rounded-[40px] text-center border-2 border-dashed border-gray-200">
            <p className="text-gray-400 font-bold">システム構成管理は準備中です</p>
          </div>
        )}
      </main>

      {/* 編集モーダル */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-6">レッスン編集</h2>
            <form onSubmit={handleUpdateItem} className="space-y-4">
              <input
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="章"
                value={editingItem.chapter}
                onChange={(e) => setEditingItem({ ...editingItem, chapter: e.target.value })}
                required
              />
              <input
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="セクション"
                value={editingItem.section}
                onChange={(e) => setEditingItem({ ...editingItem, section: e.target.value })}
                required
              />
              <input
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="レッスンタイトル"
                value={editingItem.title}
                onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                required
              />
              <input
                type="number"
                min={0}
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="報酬（円）"
                value={editingItem.reward || ""}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, reward: Number(e.target.value) })
                }
                required
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-50 transition"
                >
                  {isSaving ? "保存中..." : "保存する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
