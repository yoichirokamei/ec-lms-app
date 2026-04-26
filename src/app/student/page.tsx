"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import CountUp from "../../components/CountUp";
import Image from "next/image";
import confetti from "canvas-confetti";

const getLevelData = (amount: number) => {
  if (amount >= 150000) return { lv: 9, name: "ECストラテジスト", next: 0 };
  if (amount >= 120000) return { lv: 8, name: "ECグロースパートナー", next: 150000 };
  if (amount >= 100000) return { lv: 7, name: "ECディレクター", next: 120000 };
  if (amount >= 80000)  return { lv: 6, name: "ECプランナー", next: 100000 };
  if (amount >= 60000)  return { lv: 5, name: "ECクリエイター", next: 80000 };
  if (amount >= 40000)  return { lv: 4, name: "ECビルダー", next: 60000 };
  if (amount >= 30000)  return { lv: 3, name: "ECビルダー見習い", next: 40000 };
  if (amount >= 10000)  return { lv: 2, name: "ECラーナー", next: 30000 };
  if (amount >= 5000)   return { lv: 1, name: "ECビギナー", next: 10000 };
  return { lv: 0, name: "EC学習生", next: 5000 };
};

export default function StudentDashboard() {
  const [userData, setUserData] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [curriculumTree, setCurriculumTree] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState<{ [key: string]: string }>({});
  const [openChapters, setOpenChapters] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const data = userSnap.data();
            // 連続ログイン判定
            const updatedData = checkLoginStreak(user.uid, data);
            setUserData(updatedData);
          }

          const q = query(collection(db, "curriculums"), orderBy("createdAt", "asc"));
          const snap = await getDocs(q);
          const lessonData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          setLessons(lessonData);

          const tree: any = {};
          const initialOpenState: { [key: string]: boolean } = {};
          lessonData.forEach(data => {
            const { chapter, section } = data;
            if (!tree[chapter]) {
              tree[chapter] = {};
              initialOpenState[chapter] = true;
            }
            if (!tree[chapter][section]) tree[chapter][section] = [];
            tree[chapter][section].push(data);
          });
          setCurriculumTree(tree);
          setOpenChapters(initialOpenState);
        } catch (error) { console.error(error); }
      } else { router.push("/login"); }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const checkLoginStreak = (uid: string, data: any) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const lastLogin = data.lastLoginDate ? new Date(data.lastLoginDate).getTime() : 0;
    const oneDay = 24 * 60 * 60 * 1000;

    let newStreak = data.loginStreak || 0;

    if (today === lastLogin) {
    } else if (today === lastLogin + oneDay) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    const updated = { ...data, loginStreak: newStreak, lastLoginDate: today };
    updateDoc(doc(db, "users", uid), { loginStreak: newStreak, lastLoginDate: today });
    return updated;
  };

  const levelInfo = getLevelData(userData?.earnedAmount || 0);
  const dateInfo = (() => {
    if (!userData?.startDate) return null;
    const start = new Date(userData.startDate);
    // Firestore に保存済みの goalDate を優先、なければ startDate + 90日で計算
    const goalDate = userData.goalDate
      ? new Date(userData.goalDate)
      : (() => { const d = new Date(start); d.setDate(start.getDate() + 90); return d; })();
    const supportDate = userData.supportEndDate
      ? new Date(userData.supportEndDate)
      : (() => { const d = new Date(goalDate); d.setFullYear(goalDate.getFullYear() + 1); return d; })();
    const diff = Math.ceil((goalDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return {
      start: userData.startDate,
      goal: goalDate.toLocaleDateString("ja-JP"),
      support: supportDate.toLocaleDateString("ja-JP"),
      remaining: diff > 0 ? diff : 0,
    };
  })();

  const handleComplete = async (lessonId: string, reward: number) => {
    const userComment = comment[lessonId] || "";
    try {
      const userRef = doc(db, "users", userData.uid);
      const newAmount = (userData.earnedAmount || 0) + reward;
      const newProgress = [...(userData.progress || []), lessonId];
      const newComments = userData.comments || {};
      newComments[lessonId] = { text: userComment, date: new Date().toISOString(), read: false };

      await updateDoc(userRef, { earnedAmount: newAmount, progress: newProgress, comments: newComments, hasNewComment: true });
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#f38118", "#0066ff", "#ffffff"]
      });

      setUserData({ ...userData, earnedAmount: newAmount, progress: newProgress, comments: newComments });
    } catch (err) { console.error(err); }
  };

  const toggleChapter = (chapter: string) => {
    setOpenChapters(prev => ({ ...prev, [chapter]: !prev[chapter] }));
  };

  if (loading) return <div className="p-8 text-center font-bold">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      <header className="border-b border-gray-100 px-6 h-20 flex items-center justify-between sticky top-0 bg-white z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#f38118] rounded-lg flex items-center justify-center text-white font-black text-sm">EC</div>
          <span className="font-black text-xl tracking-tighter">ECでええじゃないか</span>
        </div>
        <button onClick={() => signOut(auth)} className="text-sm font-bold text-gray-400">ログアウト</button>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-50 text-center">
            <p className="text-lg font-black text-blue-600 uppercase mb-4">{levelInfo.name}</p>
            <div className="relative w-56 h-56 mx-auto mb-6">
              <Image src={`/levels/${levelInfo.lv}.webp`} alt="Rank" fill className="object-contain" priority />
            </div>
            <h2 className="text-2xl font-black">{userData?.name} 様</h2>
            <p className="text-xs font-bold text-gray-400 mt-2">次レベルまで あと ¥{(levelInfo.next - userData.earnedAmount).toLocaleString()}</p>
          </div>

          <div className="bg-white p-6 rounded-[30px] border-2 border-orange-100 text-center shadow-lg">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">現在の学習継続状況</p>
            <p className="text-3xl font-black text-gray-900">{userData?.loginStreak || 0} 日目</p>
            <p className="text-xs font-bold mt-2 text-[#f38118]">
              {userData?.loginStreak > 1 ? `素晴らしい！${userData.loginStreak}日継続中！` : "毎日ログインして習慣化しよう！"}
            </p>
          </div>

          <div className="bg-gradient-to-br from-[#f38118] to-[#d66d0d] p-8 rounded-[40px] text-white shadow-xl">
            <p className="text-xs font-bold opacity-80 mb-2 uppercase">現在の獲得合計金額</p>
            <div className="text-5xl font-black tracking-tighter"><CountUp value={userData?.earnedAmount || 0} /></div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-xl border border-gray-50">
            <div className="bg-blue-50 p-6 rounded-[30px] text-center border border-blue-100">
              <p className="text-xs text-blue-500 font-black mb-1">講座完走目標日まで</p>
              <p className="text-5xl font-black text-blue-600 tracking-tighter">あと {dateInfo?.remaining} 日</p>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 text-center">実務案件サポート期限：<br /><span className="font-bold text-gray-600">{dateInfo?.support} まで</span></p>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-8">
          <h3 className="text-3xl font-black text-gray-900 tracking-tighter mb-10">学習カリキュラム</h3>

          {Object.keys(curriculumTree).map((chapter) => (
            <div key={chapter} className="space-y-6">
              {/* 改修したアコーディオンヘッダー */}
              <button 
                onClick={() => toggleChapter(chapter)}
                className="w-full flex items-center justify-between text-left group bg-white p-4 pr-6 rounded-2xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-100"
              >
                <h4 className="text-2xl font-black text-gray-900 flex items-center">
                  <span className="w-2 h-8 bg-[#f38118] rounded-full mr-4 shadow-sm shadow-orange-100"></span>
                  {chapter}
                </h4>
                {/* 青丸のボタンデザイン */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-md ${openChapters[chapter] ? "bg-gray-400" : "bg-[#0066ff] group-hover:bg-blue-700 group-hover:scale-110"}`}>
                  <span className="text-white font-black text-xl leading-none">
                    {openChapters[chapter] ? "−" : "+"}
                  </span>
                </div>
              </button>
              
              {openChapters[chapter] && (
                <div className="space-y-8 animate-in slide-in-from-top-4 duration-300 ml-2">
                  {Object.keys(curriculumTree[chapter]).map((section) => (
                    <div key={section} className="bg-white rounded-[35px] p-8 shadow-sm border border-gray-100">
                      <p className="text-xs font-black text-gray-300 mb-6 uppercase tracking-[0.3em]">{section}</p>
                      <div className="space-y-6">
                        {curriculumTree[chapter][section].map((task: any) => {
                          const isCompleted = userData?.progress?.includes(task.id);
                          return (
                            <div key={task.id} className={`p-6 rounded-[30px] border transition-all ${isCompleted ? "bg-gray-50 border-transparent" : "bg-white border-gray-100 hover:border-orange-100"}`}>
                              <div className="flex justify-between items-center mb-4">
                                <div>
                                  <p className={`text-lg font-bold ${isCompleted ? "text-gray-300 line-through" : "text-gray-800"}`}>{task.title}</p>
                                  <p className="text-xs font-black text-[#f38118] mt-1">報酬: ¥{task.reward.toLocaleString()}</p>
                                </div>
                                {isCompleted && <span className="bg-green-100 text-green-600 text-[10px] font-black px-4 py-1.5 rounded-full uppercase">Cleared</span>}
                              </div>
                              {!isCompleted && (
                                <div className="mt-4 space-y-4">
                                  <textarea
                                    placeholder="進捗報告や質問を入力"
                                    className="w-full text-sm p-5 bg-gray-50 rounded-[25px] border-none outline-none focus:ring-2 focus:ring-orange-200 min-h-[100px]"
                                    value={comment[task.id] || ""}
                                    onChange={(e) => setComment({ ...comment, [task.id]: e.target.value })}
                                  />
                                  <button
                                    onClick={() => handleComplete(task.id, task.reward)}
                                    className="w-full py-5 bg-[#0066ff] hover:bg-blue-700 text-white rounded-[25px] font-black text-sm shadow-xl transition-all active:scale-95"
                                  >
                                    完了を報告する
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
