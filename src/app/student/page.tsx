"use client";

import { useEffect, useState, useRef } from "react";
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

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function StudentDashboard() {
  const [userData, setUserData] = useState<any>(null);

  const [curriculumTree, setCurriculumTree] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState<{ [key: string]: string }>({});
  const [openChapters, setOpenChapters] = useState<{ [key: string]: boolean }>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const curriculumRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            setUserData({ ...userSnap.data(), uid: user.uid });
          }

          const q = query(collection(db, "curriculums"), orderBy("createdAt", "asc"));
          const snap = await getDocs(q);
          const lessonData = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() as any }))
            .sort((a, b) => {
              const ai = a.order !== undefined ? a.order : 0;
              const bi = b.order !== undefined ? b.order : 0;
              return ai - bi;
            });
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

  const levelInfo = getLevelData(userData?.earnedAmount || 0);
  const dateInfo = (() => {
    if (!userData?.startDate) return null;
    const start = new Date(userData.startDate);
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

      const todayStr = toDateStr(new Date());
      const newLearningDates = [...new Set([...(userData.learningDates || []), todayStr])];

      await updateDoc(userRef, {
        earnedAmount: newAmount,
        progress: newProgress,
        comments: newComments,
        hasNewComment: true,
        learningDates: newLearningDates,
      });

      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#f38118", "#0066ff", "#ffffff"],
      });

      setUserData({ ...userData, earnedAmount: newAmount, progress: newProgress, comments: newComments, learningDates: newLearningDates });
    } catch (err) { console.error(err); }
  };

  const toggleChapter = (chapter: string) => {
    setOpenChapters(prev => ({ ...prev, [chapter]: !prev[chapter] }));
  };

  // --- Calendar helpers ---
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIdx = calendarMonth.getMonth();

  const getCalendarWeeks = () => {
    const firstDay = new Date(calendarYear, calendarMonthIdx, 1);
    const lastDay = new Date(calendarYear, calendarMonthIdx + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
    const days: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return weeks;
  };

  const isLearningDay = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return (userData?.learningDates || []).includes(dateStr);
  };

  const isToday = (day: number) => {
    const now = new Date();
    return now.getFullYear() === calendarYear && now.getMonth() === calendarMonthIdx && now.getDate() === day;
  };

  const prevMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx - 1, 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx + 1, 1));

  const weeks = getCalendarWeeks();
  const dayLabels = ["月", "火", "水", "木", "金", "土", "日"];

  if (loading) return <div className="p-8 text-center font-bold">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      <header className="border-b border-gray-100 px-6 h-20 flex items-center justify-between sticky top-0 bg-white z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#f38118] rounded-lg flex items-center justify-center text-white font-black text-sm">EC</div>
          <span className="font-black text-xl tracking-tighter">ECでええじゃないか</span>
        </div>
        <button type="button" onClick={() => signOut(auth)} className="text-sm font-bold text-gray-400">ログアウト</button>
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

          {/* 学習のきろく カレンダー */}
          <div className="bg-white p-6 rounded-[30px] border border-gray-100 shadow-lg">
            <p className="text-base font-black text-gray-800 mb-5">🔥 学習のきろく</p>

            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-700">
                {calendarYear}年 {calendarMonthIdx + 1}月
              </p>
              <div className="flex gap-1">
                <button type="button" onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 font-bold text-sm">‹</button>
                <button type="button" onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 font-bold text-sm">›</button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {dayLabels.map(label => (
                <div key={label} className="text-center text-[11px] font-bold text-gray-400 py-1">{label}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="space-y-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((day, di) => (
                    <div key={di} className="flex items-center justify-center py-0.5">
                      {day === null ? (
                        <div className="w-8 h-8" />
                      ) : isLearningDay(day) ? (
                        <div className="w-8 h-8 flex items-center justify-center text-lg leading-none">🔥</div>
                      ) : isToday(day) ? (
                        <div className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-green-400 text-[11px] font-bold text-green-500">{day}</div>
                      ) : (
                        <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <span className="text-base">🔥</span> 学習した日
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <div className="w-4 h-4 rounded-full bg-gray-100" /> おやすみした日
              </div>
            </div>
            <p className="text-[10px] text-[#f38118] font-bold mt-2">
              Tipsもしくはレッスンを1つ以上完了した日に🔥が付きます
            </p>

            {/* CTA button */}
            <button
              type="button"
              onClick={() => curriculumRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="mt-4 w-full py-4 bg-violet-500 hover:bg-violet-600 text-white rounded-[20px] font-black text-sm shadow-lg transition-all active:scale-95"
            >
              今日の学習を報告する
            </button>
          </div>

          <div className="bg-gradient-to-br from-[#f38118] to-[#d66d0d] p-8 rounded-[40px] text-white shadow-xl">
            <p className="text-xs font-bold opacity-80 mb-2 uppercase">獲得スキル評価額</p>
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

        <div ref={curriculumRef} className="lg:col-span-8 space-y-8">
          <h3 className="text-3xl font-black text-gray-900 tracking-tighter mb-10">学習カリキュラム</h3>

          {Object.keys(curriculumTree).map((chapter) => (
            <div key={chapter} className="space-y-6">
              <button
                type="button"
                onClick={() => toggleChapter(chapter)}
                className="w-full flex items-center justify-between text-left group bg-white p-4 pr-6 rounded-2xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-100"
              >
                <h4 className="text-2xl font-black text-gray-900 flex items-center">
                  <span className="w-2 h-8 bg-[#f38118] rounded-full mr-4 shadow-sm shadow-orange-100"></span>
                  {chapter}
                </h4>
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
                                    type="button"
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
