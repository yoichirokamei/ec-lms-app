"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [student, setStudent] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || !user.email?.includes("admin")) {
        router.push("/login");
        return;
      }

      const [studentSnap, lessonsSnap] = await Promise.all([
        getDoc(doc(db, "users", id)),
        getDocs(query(collection(db, "curriculums"), orderBy("createdAt", "asc"))),
      ]);

      if (studentSnap.exists()) {
        setStudent({ id: studentSnap.id, ...studentSnap.data() });
      }
      setLessons(lessonsSnap.docs.map((d) => ({ id: d.id, ...d.data() as any })));
      setLoading(false);
    });
    return () => unsub();
  }, [id, router]);

  const handleMarkRead = async (lessonId: string) => {
    if (!student) return;
    const updated = {
      ...student.comments,
      [lessonId]: { ...student.comments[lessonId], read: true },
    };
    await updateDoc(doc(db, "users", id), { comments: updated });
    setStudent((prev: any) => ({
      ...prev,
      comments: updated,
      hasNewComment: Object.values(updated).some((c: any) => !c.read),
    }));
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen text-gray-500 font-bold">
        読み込み中...
      </div>
    );

  if (!student)
    return (
      <div className="flex justify-center items-center h-screen text-gray-500 font-bold">
        受講生が見つかりません
      </div>
    );

  const completedIds: string[] = student.progress || [];
  const completedLessons = lessons.filter((l) => completedIds.includes(l.id));
  const progressPct =
    lessons.length > 0 ? Math.round((completedIds.length / lessons.length) * 100) : 0;
  const earnedAmount: number = student.earnedAmount || 0;

  const comments = student.comments as
    | Record<string, { text: string; date: string; read: boolean }>
    | undefined;
  const commentEntries = comments
    ? Object.entries(comments).filter(([, c]) => c.text)
    : [];
  const unreadCount = commentEntries.filter(([, c]) => !c.read).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="text-gray-400 hover:text-gray-700 font-bold text-sm transition"
          >
            ← 管理者ページへ戻る
          </button>
          <div className="w-px h-5 bg-gray-200"></div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">
              EC
            </div>
            <h1 className="font-bold text-gray-800">
              {student.name || "名前未設定"} の詳細レポート
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8 space-y-6">
        {/* プロフィールカード */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 md:col-span-2">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
              受講生情報
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-1">氏名</p>
                <p className="font-bold text-gray-800">{student.name || "未設定"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-1">メールアドレス</p>
                <p className="font-bold text-gray-800 text-sm">{student.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-1">受講開始日</p>
                <p className="font-bold text-gray-800">{student.startDate || "未設定"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-1">受講終了日</p>
                <p className="font-bold text-gray-800">{student.endDate || "未設定"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-1">ステータス</p>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-black ${
                    student.startDate
                      ? "bg-green-100 text-green-600"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {student.startDate ? "受講中" : "受講日未記入"}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-1">連続ログイン</p>
                <p className="font-bold text-gray-800">{student.loginStreak || 0} 日</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-6 rounded-3xl text-white shadow-lg">
              <p className="text-xs font-bold opacity-80 mb-1">獲得スキル評価額</p>
              <p className="text-3xl font-black">¥{earnedAmount.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 mb-2">完了進捗率</p>
              <p className="text-3xl font-black text-blue-600 mb-2">{progressPct}%</p>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {completedIds.length} / {lessons.length} レッスン完了
              </p>
            </div>
          </div>
        </div>

        {/* コメント一覧 */}
        {commentEntries.length > 0 && (
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
              <h2 className="text-xl font-bold text-gray-800">
                進捗報告・質問
                {unreadCount > 0 && (
                  <span className="ml-2 bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
                    {unreadCount}件 未読
                  </span>
                )}
              </h2>
            </div>
            <div className="space-y-4">
              {commentEntries
                .sort((a, b) => new Date(b[1].date).getTime() - new Date(a[1].date).getTime())
                .map(([lessonId, c]) => {
                  const lesson = lessons.find((l) => l.id === lessonId);
                  return (
                    <div
                      key={lessonId}
                      className={`p-5 rounded-2xl border ${
                        c.read ? "bg-gray-50 border-gray-100" : "bg-blue-50 border-blue-100"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-orange-500 mb-1">
                            {lesson?.chapter} / {lesson?.section}
                          </p>
                          <p className="text-sm font-bold text-gray-700 mb-2">
                            {lesson?.title || lessonId}
                          </p>
                          <p className="text-sm text-gray-600 leading-relaxed">{c.text}</p>
                          <p className="text-[10px] text-gray-400 mt-2">
                            {new Date(c.date).toLocaleString("ja-JP")}
                          </p>
                        </div>
                        {!c.read && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(lessonId)}
                            className="shrink-0 px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition"
                          >
                            既読にする
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* 完了レッスン一覧 */}
        <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-6 bg-green-500 rounded-full"></div>
            <h2 className="text-xl font-bold text-gray-800">
              完了レッスン（{completedLessons.length}件）
            </h2>
          </div>
          {completedLessons.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">まだ完了したレッスンはありません</p>
          ) : (
            <div className="space-y-3">
              {completedLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="flex items-center justify-between p-4 bg-green-50 rounded-2xl"
                >
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-0.5">
                      {lesson.chapter} / {lesson.section}
                    </p>
                    <p className="font-bold text-gray-700">{lesson.title}</p>
                  </div>
                  <span className="text-sm font-black text-green-600 shrink-0 ml-4">
                    ¥{lesson.reward?.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
