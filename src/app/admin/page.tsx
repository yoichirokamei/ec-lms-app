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
  orderBy,
  where,
  getDocs,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("total"); // total, detail, curriculum, config
  const [pendingStudent, setPendingStudent] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !user.email?.includes("admin")) {
        router.push("/login");
      }
    });

    // 受講生一覧の取得
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubDocs = onSnapshot(q, (snapshot) => {
      const sData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setStudents(sData);

      // 開始日が設定されていない（未承認）受講生を探す
      // Vercelのビルドエラー回避のため : any を追加
      const unassigned = sData.find((s: any) => !s.startDate);
      if (unassigned) setPendingStudent(unassigned);

      setLoading((dist) => false);
      setLoading(false);
    });

    return () => {
      unsubAuth();
      unsubDocs();
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  // 受講期間の設定（承認）
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

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        読み込み中...
      </div>
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
            <h1 className="font-bold text-lg hidden md:block">
              管理者ダッシュボード
            </h1>
          </div>

          <nav className="flex bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setView("total")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "total" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              全体統計
            </button>
            <button
              onClick={() => setView("detail")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "detail" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              受講生詳細
            </button>
            <button
              onClick={() => setView("curriculum")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "curriculum" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              カリキュラム登録
            </button>
            <button
              onClick={() => setView("config")}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === "config" ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}
            >
              構成管理
            </button>
          </nav>

          <button
            onClick={handleLogout}
            className="text-gray-500 text-sm font-bold hover:text-red-500 transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8">
        {/* 承認待ちアラート */}
        {pendingStudent && (
          <div className="mb-8 bg-orange-50 border-2 border-orange-200 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse">
            <div>
              <p className="text-orange-800 font-bold text-lg">
                新着の受講生がいます！
              </p>
              <p className="text-orange-600 text-sm">
                {pendingStudent.email} さんの受講期間を設定してください。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(pendingStudent.id, 90)}
                className="bg-orange-500 text-white px-6 py-2 rounded-2xl font-bold shadow-lg hover:bg-orange-600"
              >
                90日間で承認
              </button>
              <button
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
            {/* スタッツカード */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">
                  総報酬発生額
                </p>
                <p className="text-2xl font-black text-orange-600">¥127,500</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">
                  スクール平均進捗
                </p>
                <p className="text-2xl font-black text-blue-600">84%</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">
                  期間内完走率
                </p>
                <p className="text-2xl font-black text-green-500">100%</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">
                  期限超過率
                </p>
                <p className="text-2xl font-black text-red-500">0%</p>
              </div>
            </div>

            {/* 受講生リスト */}
            <section className="bg-white rounded-[40px] shadow-sm border border-gray-100 p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-2 h-6 bg-orange-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-800">
                  受講生進捗 & 期限管理
                </h2>
              </div>

              <div className="space-y-6">
                {students.map((student) => {
                  const today = new Date();
                  const end = student.endDate
                    ? new Date(student.endDate)
                    : null;
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
                        <p className="text-xs text-gray-400 font-medium">
                          {student.email}
                        </p>
                      </div>

                      <div className="flex-1 w-full md:max-w-xs px-0 md:px-8 mb-4 md:mb-0">
                        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                          <span>現在の進捗</span>
                          <span className="text-blue-600">
                            {student.progress || 0}%
                          </span>
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
                          <p className="text-[10px] font-bold text-gray-400 mb-0.5">
                            受講開始日
                          </p>
                          <input
                            type="date"
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
                          <p className="text-[10px] font-bold text-gray-400 mb-0.5">
                            目標まで
                          </p>
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
            {students.map((s) => (
              <div
                key={s.id}
                className="bg-white p-6 rounded-3xl border shadow-sm"
              >
                <p className="font-bold">{s.name || "名前未設定"}</p>
                <p className="text-sm text-gray-400 mb-4">{s.email}</p>
                <button
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
          <div className="bg-white p-10 rounded-[40px] text-center border-2 border-dashed border-gray-200">
            <p className="text-gray-400 font-bold">
              カリキュラム編集機能は準備中です
            </p>
          </div>
        )}

        {view === "config" && (
          <div className="bg-white p-10 rounded-[40px] text-center border-2 border-dashed border-gray-200">
            <p className="text-gray-400 font-bold">
              システム構成管理は準備中です
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
