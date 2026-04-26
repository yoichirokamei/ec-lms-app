"use client";

import { useEffect, useState } from "react";
import { auth, db, firebaseConfig } from "../../lib/firebase";
import { onAuthStateChanged, signOut, getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

// startDate から完走目標日・サポート終了日を計算
function calcDates(startDateStr: string) {
  const start = new Date(startDateStr);
  const goal = new Date(start);
  goal.setDate(start.getDate() + 90);
  const support = new Date(goal);
  support.setFullYear(goal.getFullYear() + 1);
  return {
    goalDate: goal.toISOString().split("T")[0],
    supportEndDate: support.toISOString().split("T")[0],
  };
}

export default function AdminDashboard() {
  const [students, setStudents] = useState<any[]>([]);
  const [curricula, setCurricula] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("total");
  const [pendingStudent, setPendingStudent] = useState<any>(null);

  // カリキュラム編集
  const [editingItem, setEditingItem] = useState<any>(null);
  const [newItem, setNewItem] = useState({ chapter: "", section: "", title: "", reward: 0 });
  const [isSaving, setIsSaving] = useState(false);

  // 受講生詳細アコーディオン
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // 受講生追加モーダル
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: "", email: "", password: "" });
  const [addingStudent, setAddingStudent] = useState(false);
  const [addError, setAddError] = useState("");

  const router = useRouter();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !user.email?.includes("admin")) router.push("/login");
    });

    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubDocs = onSnapshot(q, (snapshot) => {
      const sData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStudents(sData);
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

    return () => { unsubAuth(); unsubDocs(); unsubCurricula(); };
  }, [router]);

  // ---- ヘルパー ----
  const nonAdminStudents = students.filter((s: any) => !s.email?.includes("admin"));

  // 進捗は 0〜100% にキャップ
  const getProgressPct = (student: any) =>
    curricula.length > 0
      ? Math.min(100, Math.round(((student.progress?.length || 0) / curricula.length) * 100))
      : 0;

  // goalDate を取得（Firestore 保存値 → フォールバック計算）
  const getGoalDate = (student: any): Date | null => {
    if (student.goalDate) return new Date(student.goalDate);
    if (student.startDate) {
      const d = new Date(student.startDate);
      d.setDate(d.getDate() + 90);
      return d;
    }
    return null;
  };

  const getSupportEndDate = (student: any): Date | null => {
    if (student.supportEndDate) return new Date(student.supportEndDate);
    const goal = getGoalDate(student);
    if (goal) {
      const d = new Date(goal);
      d.setFullYear(d.getFullYear() + 1);
      return d;
    }
    return null;
  };

  // ---- 統計値（実データ） ----
  const totalEarned = nonAdminStudents.reduce((sum, s) => sum + (s.earnedAmount || 0), 0);
  const avgProgress =
    nonAdminStudents.length > 0
      ? Math.round(nonAdminStudents.reduce((sum, s) => sum + getProgressPct(s), 0) / nonAdminStudents.length)
      : 0;
  const today = new Date();
  const activeStudents = nonAdminStudents.filter((s) => s.startDate);
  const overdueStudents = activeStudents.filter((s) => {
    const goal = getGoalDate(s);
    return goal && today > goal && (s.progress?.length || 0) < curricula.length;
  });
  const overdueRate =
    activeStudents.length > 0
      ? Math.round((overdueStudents.length / activeStudents.length) * 100)
      : 0;
  const completionRate = 100 - overdueRate;

  // ---- ハンドラー ----
  const handleLogout = async () => { await signOut(auth); router.push("/login"); };

  const handleApprove = async (studentId: string, days: number) => {
    const startDate = new Date();
    const startStr = startDate.toISOString().split("T")[0];
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + days);
    const { goalDate, supportEndDate } = calcDates(startStr);

    await updateDoc(doc(db, "users", studentId), {
      startDate: startStr,
      endDate: endDate.toISOString().split("T")[0],
      goalDate,
      supportEndDate,
      status: "active",
    });
    setPendingStudent(null);
  };

  const handleStartDateChange = async (student: any, newStartDate: string) => {
    const { goalDate, supportEndDate } = calcDates(newStartDate);
    const updates: Record<string, string> = { startDate: newStartDate, goalDate, supportEndDate };

    // 承認済みの場合は受講期間（日数）を維持してendDateも再計算
    if (student.startDate && student.endDate) {
      const durationDays = Math.round(
        (new Date(student.endDate).getTime() - new Date(student.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      const newEnd = new Date(newStartDate);
      newEnd.setDate(newEnd.getDate() + durationDays);
      updates.endDate = newEnd.toISOString().split("T")[0];
    }
    await updateDoc(doc(db, "users", student.id), updates);
  };

  // 受講生を管理者側から追加（サブアプリで auth 状態を汚さず作成）
  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddingStudent(true);
    setAddError("");
    let secondaryApp: ReturnType<typeof initializeApp> | null = null;
    try {
      secondaryApp = initializeApp(firebaseConfig, `admin-create-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        newStudent.email,
        newStudent.password
      );
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: newStudent.name,
        email: newStudent.email,
        earnedAmount: 0,
        progress: [],
        createdAt: new Date(),
      });
      setNewStudent({ name: "", email: "", password: "" });
      setShowAddStudent(false);
    } catch (err: any) {
      const msg: Record<string, string> = {
        "auth/email-already-in-use": "このメールアドレスは既に使用されています",
        "auth/weak-password": "パスワードは6文字以上にしてください",
        "auth/invalid-email": "メールアドレスの形式が正しくありません",
      };
      setAddError(msg[err.code] ?? "登録に失敗しました: " + err.message);
    } finally {
      if (secondaryApp) await deleteApp(secondaryApp);
      setAddingStudent(false);
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`「${studentName}」さんのデータを削除しますか？\n※ Firebase Auth アカウントは Firebase コンソールから別途削除してください。`))
      return;
    await deleteDoc(doc(db, "users", studentId));
    if (expandedStudentId === studentId) setExpandedStudentId(null);
  };

  const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await addDoc(collection(db, "curriculums"), {
        ...newItem, reward: Number(newItem.reward), createdAt: serverTimestamp(),
      });
      setNewItem({ chapter: "", section: "", title: "", reward: 0 });
    } finally { setIsSaving(false); }
  };

  const handleUpdateItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "curriculums", editingItem.id), {
        chapter: editingItem.chapter, section: editingItem.section,
        title: editingItem.title, reward: Number(editingItem.reward),
      });
      setEditingItem(null);
    } finally { setIsSaving(false); }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("このレッスンを削除しますか？")) return;
    await deleteDoc(doc(db, "curriculums", id));
  };

  // カリキュラムツリー（構成管理プレビュー用）
  const curriculumTree: Record<string, Record<string, any[]>> = {};
  curricula.forEach((item) => {
    if (!curriculumTree[item.chapter]) curriculumTree[item.chapter] = {};
    if (!curriculumTree[item.chapter][item.section]) curriculumTree[item.chapter][item.section] = [];
    curriculumTree[item.chapter][item.section].push(item);
  });

  if (loading)
    return <div className="flex justify-center items-center h-screen">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xl">EC</div>
            <h1 className="font-bold text-lg hidden md:block">管理者ダッシュボード</h1>
          </div>
          <nav className="flex bg-gray-100 p-1 rounded-xl">
            {([
              ["total", "全体統計"],
              ["detail", "受講生詳細"],
              ["curriculum", "カリキュラム登録"],
              ["config", "構成管理"],
            ] as [string, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setView(id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${view === id ? "bg-white shadow-sm text-orange-600" : "text-gray-500"}`}>
                {label}
              </button>
            ))}
          </nav>
          <button type="button" onClick={handleLogout}
            className="text-gray-500 text-sm font-bold hover:text-red-500 transition">
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8">
        {/* 承認待ちアラート */}
        {pendingStudent && (
          <div className="mb-8 bg-orange-50 border-2 border-orange-200 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-orange-800 font-bold text-lg">新着の受講生がいます！</p>
              <p className="text-orange-600 text-sm">{pendingStudent.email} さんの受講期間を設定してください。</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleApprove(pendingStudent.id, 90)}
                className="bg-orange-500 text-white px-6 py-2 rounded-2xl font-bold shadow-lg hover:bg-orange-600">
                90日間で承認
              </button>
              <button type="button" onClick={() => handleApprove(pendingStudent.id, 180)}
                className="bg-white text-orange-500 border-2 border-orange-500 px-6 py-2 rounded-2xl font-bold hover:bg-orange-50">
                180日間で承認
              </button>
            </div>
          </div>
        )}

        {/* ===== 全体統計 ===== */}
        {view === "total" && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">総報酬発生額</p>
                <p className="text-2xl font-black text-orange-600">¥{totalEarned.toLocaleString()}</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">スクール平均進捗</p>
                <p className="text-2xl font-black text-blue-600">{avgProgress}%</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">期間内完走率</p>
                <p className="text-2xl font-black text-green-500">{completionRate}%</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">期限超過率</p>
                <p className="text-2xl font-black text-red-500">{overdueRate}%</p>
              </div>
            </div>

            <section className="bg-white rounded-[40px] shadow-sm border border-gray-100 p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-2 h-6 bg-orange-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-800">受講生進捗 & 期限管理</h2>
              </div>
              <div className="space-y-4">
                {nonAdminStudents.map((student) => {
                  const goalDate = getGoalDate(student);
                  const supportEndDate = getSupportEndDate(student);
                  const diffDays = goalDate
                    ? Math.ceil((goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  const isExpired = diffDays !== null && diffDays < 0;
                  const progressPct = getProgressPct(student);

                  return (
                    <div key={student.id}
                      className="flex flex-col md:flex-row items-start md:items-start justify-between p-4 hover:bg-gray-50 rounded-2xl transition border-b border-gray-50 last:border-0 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-base">{student.name || "名前未設定"}</p>
                        <p className="text-xs text-gray-400">{student.email}</p>
                      </div>

                      <div className="w-full md:w-48">
                        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                          <span>進捗 ({student.progress?.length || 0}/{curricula.length})</span>
                          <span className="text-blue-600">{progressPct}%</span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full transition-all duration-700"
                            style={{ width: `${progressPct}%` }}></div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 text-right shrink-0">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400">受講開始日</p>
                          <input type="date" title="受講開始日"
                            defaultValue={student.startDate}
                            key={student.startDate}
                            className="text-xs font-bold text-gray-600 bg-gray-50 px-2 py-1 rounded-lg outline-none cursor-pointer"
                            onChange={(e) => handleStartDateChange(student, e.target.value)}
                          />
                        </div>
                        {goalDate && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400">完走目標</p>
                            <p className="text-xs font-bold text-gray-600">
                              {goalDate.toLocaleDateString("ja-JP")}
                            </p>
                          </div>
                        )}
                        {supportEndDate && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400">サポート終了</p>
                            <p className="text-xs font-bold text-blue-600">
                              {supportEndDate.toLocaleDateString("ja-JP")}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className={`px-4 py-3 rounded-2xl text-center min-w-[90px] shrink-0 ${
                        diffDays === null ? "bg-gray-50" : isExpired ? "bg-red-50" : "bg-green-50"
                      }`}>
                        <p className="text-[10px] font-bold text-gray-400 mb-0.5">完走まで</p>
                        <p className={`text-sm font-black ${
                          diffDays === null ? "text-gray-400" : isExpired ? "text-red-500" : "text-green-500"
                        }`}>
                          {diffDays === null ? "未設定" : isExpired ? "期限超過" : `あと\n${diffDays}日`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ===== 受講生詳細（アコーディオン + 追加・削除） ===== */}
        {view === "detail" && (
          <div className="space-y-4">
            {/* 追加ボタン */}
            <div className="flex justify-end">
              <button type="button" onClick={() => { setShowAddStudent(true); setAddError(""); }}
                className="px-6 py-2.5 bg-orange-500 text-white rounded-2xl text-sm font-bold hover:bg-orange-600 shadow-lg shadow-orange-100 transition">
                + 受講生を追加
              </button>
            </div>

            {nonAdminStudents.length === 0 && (
              <div className="bg-white p-10 rounded-[40px] text-center border border-gray-100">
                <p className="text-gray-400 font-bold">受講生がいません</p>
              </div>
            )}
            {nonAdminStudents.map((s) => {
              const isOpen = expandedStudentId === s.id;
              const progressPct = getProgressPct(s);
              const completedLessons = curricula.filter((l) =>
                (s.progress as string[] | undefined)?.includes(l.id)
              );
              const goalDate = getGoalDate(s);
              const supportEndDate = getSupportEndDate(s);
              const comments = s.comments as
                | Record<string, { text: string; date: string; read: boolean }>
                | undefined;
              const commentEntries = comments
                ? Object.entries(comments).filter(([, c]) => c.text)
                : [];
              const unreadCount = commentEntries.filter(([, c]) => !c.read).length;

              return (
                <div key={s.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* ヘッダー行 */}
                  <button type="button"
                    onClick={() => setExpandedStudentId(isOpen ? null : s.id)}
                    className="w-full flex items-center justify-between px-6 py-5 hover:bg-gray-50 transition text-left">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center font-black text-orange-500 shrink-0">
                        {(s.name || "?").charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{s.name || "名前未設定"}</p>
                        <p className="text-xs text-gray-400">{s.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                          未読 {unreadCount}
                        </span>
                      )}
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400">進捗</p>
                        <p className="font-black text-blue-600 text-sm">{progressPct}%</p>
                      </div>
                      <span className={`text-gray-300 font-bold text-lg transition-transform duration-200 ${isOpen ? "-rotate-180" : ""}`}>▾</span>
                    </div>
                  </button>

                  {/* 展開パネル */}
                  {isOpen && (
                    <div className="border-t border-gray-100 p-6 space-y-5 bg-gray-50/60">
                      {/* サマリー */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-gray-400 mb-1">獲得金額</p>
                          <p className="font-black text-orange-500">¥{(s.earnedAmount || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-gray-400 mb-1">完了レッスン</p>
                          <p className="font-black text-gray-800">{completedLessons.length} / {curricula.length}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-gray-400 mb-1">連続ログイン</p>
                          <p className="font-black text-gray-800">{s.loginStreak || 0} 日</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-gray-400 mb-1">ステータス</p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${
                            s.status === "active" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                          }`}>
                            {s.status === "active" ? "受講中" : "承認待ち"}
                          </span>
                        </div>
                      </div>

                      {/* 日程情報（startDate〜サポート終了） */}
                      <div className="bg-white rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 mb-1">受講開始日</p>
                          <p className="font-bold text-gray-700">{s.startDate || "未設定"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-orange-400 mb-1">完走目標日（+90日）</p>
                          <p className="font-bold text-orange-600">
                            {goalDate ? goalDate.toLocaleDateString("ja-JP") : "未設定"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-blue-400 mb-1">サポート終了日（+1年）</p>
                          <p className="font-bold text-blue-600">
                            {supportEndDate ? supportEndDate.toLocaleDateString("ja-JP") : "未設定"}
                          </p>
                        </div>
                      </div>

                      {/* 進捗バー */}
                      <div className="bg-white p-4 rounded-2xl">
                        <div className="flex justify-between text-xs font-bold text-gray-400 mb-2">
                          <span>学習進捗（{s.progress?.length || 0} / {curricula.length} レッスン）</span>
                          <span className="text-blue-600">{progressPct}%</span>
                        </div>
                        <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full transition-all duration-700"
                            style={{ width: `${progressPct}%` }}></div>
                        </div>
                      </div>

                      {/* コメント */}
                      {commentEntries.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            進捗報告・質問（{commentEntries.length}件）
                          </p>
                          <div className="space-y-2">
                            {commentEntries
                              .sort((a, b) => new Date(b[1].date).getTime() - new Date(a[1].date).getTime())
                              .slice(0, 5)
                              .map(([lessonId, c]) => {
                                const lesson = curricula.find((l) => l.id === lessonId);
                                return (
                                  <div key={lessonId}
                                    className={`p-4 rounded-2xl ${c.read ? "bg-gray-50" : "bg-blue-50 border border-blue-100"}`}>
                                    <p className="text-xs font-bold text-orange-500 mb-1">{lesson?.title || lessonId}</p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
                                    <p className="text-[10px] text-gray-400 mt-1">{new Date(c.date).toLocaleString("ja-JP")}</p>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* 完了レッスン */}
                      {completedLessons.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            完了レッスン（{completedLessons.length}件）
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {completedLessons.map((lesson) => (
                              <div key={lesson.id} className="flex items-center justify-between bg-green-50 px-4 py-2 rounded-xl">
                                <p className="text-xs font-bold text-gray-700 truncate">{lesson.title}</p>
                                <span className="text-xs font-black text-green-600 ml-2 shrink-0">
                                  ¥{lesson.reward?.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 削除ボタン */}
                      <div className="flex justify-end pt-2">
                        <button type="button"
                          onClick={() => handleDeleteStudent(s.id, s.name || "名前未設定")}
                          className="px-5 py-2 bg-red-50 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-100 transition border border-red-100">
                          この受講生を削除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ===== カリキュラム登録 ===== */}
        {view === "curriculum" && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-6 bg-orange-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-800">新規レッスン追加</h2>
              </div>
              <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="章（例: 第1章 EC基礎）" value={newItem.chapter}
                  onChange={(e) => setNewItem({ ...newItem, chapter: e.target.value })} required />
                <input className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="セクション（例: ストア構築）" value={newItem.section}
                  onChange={(e) => setNewItem({ ...newItem, section: e.target.value })} required />
                <input className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="レッスンタイトル" value={newItem.title}
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} required />
                <input type="number" min={0}
                  className="bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                  placeholder="報酬（円）" value={newItem.reward || ""}
                  onChange={(e) => setNewItem({ ...newItem, reward: Number(e.target.value) })} required />
                <button type="submit" disabled={isSaving}
                  className="md:col-span-2 bg-orange-500 text-white py-3 rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-50 transition">
                  {isSaving ? "保存中..." : "+ レッスンを追加"}
                </button>
              </form>
            </div>

            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-800">登録済みカリキュラム（{curricula.length}件）</h2>
              </div>
              <div className="space-y-3">
                {curricula.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-8">まだレッスンが登録されていません</p>
                )}
                {curricula.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-orange-500 mb-0.5">{item.chapter} / {item.section}</p>
                      <p className="font-bold text-gray-800">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">報酬: ¥{item.reward?.toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      <button type="button" onClick={() => setEditingItem({ ...item })}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-100 transition">
                        編集
                      </button>
                      <button type="button" onClick={() => handleDeleteItem(item.id)}
                        className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-sm font-bold hover:bg-red-100 transition">
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== 構成管理（カリキュラムプレビュー） ===== */}
        {view === "config" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">総レッスン数</p>
                <p className="text-2xl font-black text-gray-800">{curricula.length}件</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">チャプター数</p>
                <p className="text-2xl font-black text-orange-500">{Object.keys(curriculumTree).length}章</p>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-400 text-xs font-bold mb-1">総報酬額（満点）</p>
                <p className="text-2xl font-black text-green-500">
                  ¥{curricula.reduce((sum, l) => sum + (l.reward || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>

            {Object.keys(curriculumTree).length === 0 ? (
              <div className="bg-white p-10 rounded-[40px] text-center border-2 border-dashed border-gray-200">
                <p className="text-gray-400 font-bold mb-4">カリキュラムが未登録です</p>
                <button type="button" onClick={() => setView("curriculum")}
                  className="px-6 py-2 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 text-sm transition">
                  カリキュラムを追加する
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(curriculumTree).map(([chapter, sections]) => {
                  const chapterLessons = Object.values(sections).flat();
                  const chapterReward = chapterLessons.reduce((sum, l: any) => sum + (l.reward || 0), 0);
                  return (
                    <div key={chapter} className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
                      <div className="flex items-center justify-between px-6 py-5 bg-orange-50/60">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-8 bg-orange-500 rounded-full"></div>
                          <div>
                            <h3 className="font-black text-gray-800">{chapter}</h3>
                            <p className="text-xs text-gray-400">
                              {Object.keys(sections).length}セクション · {chapterLessons.length}レッスン
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-black text-orange-500">¥{chapterReward.toLocaleString()}</p>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {Object.entries(sections).map(([section, lessons]) => (
                          <div key={section} className="px-6 py-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{section}</p>
                            <div className="space-y-1">
                              {(lessons as any[]).map((lesson, i) => (
                                <div key={lesson.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50 transition">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-black text-gray-400 shrink-0">
                                      {i + 1}
                                    </span>
                                    <p className="text-sm font-bold text-gray-700 truncate">{lesson.title}</p>
                                  </div>
                                  <span className="text-xs font-black text-green-600 shrink-0 ml-3">
                                    ¥{lesson.reward?.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===== 受講生追加モーダル ===== */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-2">受講生を追加</h2>
            <p className="text-xs text-gray-400 mb-6">
              管理者側で受講生アカウントを作成します。作成後、承認待ち状態になります。
            </p>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <input
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="氏名"
                value={newStudent.name}
                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                required
              />
              <input type="email"
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="メールアドレス"
                value={newStudent.email}
                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                required
              />
              <input type="password"
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="初期パスワード（6文字以上）"
                value={newStudent.password}
                onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
                required
                minLength={6}
              />
              {addError && (
                <p className="text-red-500 text-xs font-bold text-center bg-red-50 p-3 rounded-2xl">
                  {addError}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddStudent(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition">
                  キャンセル
                </button>
                <button type="submit" disabled={addingStudent}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-50 transition">
                  {addingStudent ? "作成中..." : "アカウントを作成"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== カリキュラム編集モーダル ===== */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-6">レッスン編集</h2>
            <form onSubmit={handleUpdateItem} className="space-y-4">
              <input className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="章" value={editingItem.chapter}
                onChange={(e) => setEditingItem({ ...editingItem, chapter: e.target.value })} required />
              <input className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="セクション" value={editingItem.section}
                onChange={(e) => setEditingItem({ ...editingItem, section: e.target.value })} required />
              <input className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="レッスンタイトル" value={editingItem.title}
                onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} required />
              <input type="number" min={0}
                className="w-full bg-gray-50 px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 font-medium text-sm text-gray-800"
                placeholder="報酬（円）" value={editingItem.reward || ""}
                onChange={(e) => setEditingItem({ ...editingItem, reward: Number(e.target.value) })} required />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingItem(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition">
                  キャンセル
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-50 transition">
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
