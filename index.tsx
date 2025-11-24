import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  BarChart3, 
  Plus, 
  Trash2, 
  Save, 
  BrainCircuit, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trophy,
  Camera,
  Upload,
  Image as ImageIcon,
  X,
  ScanEye,
  Target,
  ListTodo,
  Calendar,
  Play,
  Square,
  Timer as TimerIcon,
  Users,
  Share2,
  Copy,
  UserPlus,
  RefreshCw,
  Pause,
  Home,
  Zap,
  Award,
  GraduationCap
} from 'lucide-react';

// --- Constants ---

const SUBJECTS = [
  "現代の国語",
  "言語文化",
  "数学Ⅰα",
  "数学Ⅰβ",
  "数学A",
  "論理表現Ⅰ",
  "ECⅠ",
  "化学基礎",
  "物理基礎",
  "生物基礎",
  "歴史総合",
  "芸術",
  "保健",
  "サイエンス情報Ⅰ"
];

const TEST_SCHEDULE: Record<string, string[]> = {
  "2025-12-04": ["言語文化", "保健", "芸術"],
  "2025-12-05": ["生物基礎", "数学Ⅰα", "サイエンス情報Ⅰ"],
  "2025-12-06": ["化学基礎", "数学A"],
  "2025-12-08": ["現代の国語", "論理表現Ⅰ", "物理基礎"],
  "2025-12-09": ["歴史総合", "ECⅠ", "数学Ⅰβ"],
};

// Generate dates from 2025-11-27 to 2025-12-09
const generateScheduleDates = () => {
  const dates = [];
  const start = new Date(2025, 10, 27); // Month is 0-indexed: 10 = November
  const end = new Date(2025, 11, 9);    // 11 = December

  let current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const SCHEDULE_DATES = generateScheduleDates();

const getDayType = (date: Date) => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Test period: 12/4 - 12/9 (excluding Sunday 12/7)
  if (month === 12) {
    if (day === 7) return 'sunday';
    if (day >= 4 && day <= 9) return 'exam';
  }
  return 'prep';
};

const formatDate = (date: Date) => {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}/${date.getDate()} (${days[date.getDay()]})`;
};

const getDateStr = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Helper to get "Today" or fallback to first day of schedule if out of range
const getTodayOrDefault = () => {
  const today = new Date();
  const start = SCHEDULE_DATES[0];
  const end = SCHEDULE_DATES[SCHEDULE_DATES.length - 1];
  
  // Normalize to midnight for comparison
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();

  if (t >= s && t <= e) return today;
  return start; // Fallback for demo/dev purposes
};

// --- Types ---

interface StudyEntry {
  id: string;
  dateStr: string; // YYYY-MM-DD
  subject: string;
  content: string;
  plannedMinutes: number;
  actualMinutes: number;
  isDone: boolean;
}

interface TodoItem {
  id: string;
  text: string;
  isDone: boolean;
}

interface SubjectGoal {
  subject: string;
  targetScore: number;
  actualScore?: number; // Added optional actual score
  todos: TodoItem[];
}

interface FriendStats {
  id: string;
  name: string;
  totalMinutes: number;
  goalsMetCount: number;
  lastUpdated: number;
}

interface DaySectionProps {
  date: Date;
  entries: StudyEntry[];
  goals: SubjectGoal[];
  activeTimerId: string | null;
  timerStartTimestamp: number | null;
  onAdd: () => void;
  onUpdate: (id: string, data: Partial<StudyEntry>) => void;
  onDelete: (id: string) => void;
  onStartTimer: (id: string) => void;
  onStopTimer: (id: string) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string) => void;
}

// --- Components ---

const App = () => {
  // State
  const [entries, setEntries] = useState<StudyEntry[]>(() => {
    const saved = localStorage.getItem('study-planner-data-v2');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [goals, setGoals] = useState<SubjectGoal[]>(() => {
    const saved = localStorage.getItem('study-planner-goals');
    return saved ? JSON.parse(saved) : SUBJECTS.map(s => ({
      subject: s,
      targetScore: 80,
      actualScore: undefined,
      todos: []
    }));
  });

  const [userName, setUserName] = useState(() => localStorage.getItem('study-planner-username') || '自分');
  const [friends, setFriends] = useState<FriendStats[]>(() => {
    const saved = localStorage.getItem('study-planner-friends');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeTab, setActiveTab] = useState<'home' | 'goals' | 'plan' | 'stats' | 'analyze' | 'group'>('home');
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  // Timer State
  const [activeTimerId, setActiveTimerId] = useState<string | null>(null);
  const [timerStartTimestamp, setTimerStartTimestamp] = useState<number | null>(null);

  // Wake Lock Ref
  const wakeLockRef = useRef<any>(null);

  // Persist to LocalStorage
  useEffect(() => {
    localStorage.setItem('study-planner-data-v2', JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem('study-planner-goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('study-planner-username', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('study-planner-friends', JSON.stringify(friends));
  }, [friends]);

  // --- Screen Wake Lock Logic ---
  useEffect(() => {
    const isRunning = activeTimerId !== null && timerStartTimestamp !== null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.debug('Wake Lock active');
        }
      } catch (err) {
        console.error('Wake Lock error:', err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.debug('Wake Lock released');
        } catch (err) {
          console.error('Wake Lock release error:', err);
        }
      }
    };

    if (isRunning) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [activeTimerId, timerStartTimestamp]);

  // Re-acquire Wake Lock when visibility changes (if timer is running)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      const isRunning = activeTimerId !== null && timerStartTimestamp !== null;
      if (document.visibilityState === 'visible' && isRunning && !wakeLockRef.current) {
         try {
            if ('wakeLock' in navigator) {
              wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
              console.debug('Wake Lock re-acquired');
            }
         } catch (err) {
            console.error('Wake Lock re-acquire error:', err);
         }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeTimerId, timerStartTimestamp]);


  // --- Actions ---

  const addEntry = (date: Date) => {
    const newEntry: StudyEntry = {
      id: crypto.randomUUID(),
      dateStr: getDateStr(date),
      subject: SUBJECTS[0],
      content: '',
      plannedMinutes: 30,
      actualMinutes: 0,
      isDone: false,
    };
    setEntries([...entries, newEntry]);
  };

  const updateEntry = (id: string, updates: Partial<StudyEntry>) => {
    setEntries(entries.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const deleteEntry = (id: string) => {
    // If deleting the active timer entry, stop the timer first
    if (id === activeTimerId) {
      setActiveTimerId(null);
      setTimerStartTimestamp(null);
    }
    setEntries(entries.filter(e => e.id !== id));
  };

  // Timer Actions
  const handleStartTimer = (id: string) => {
    if (activeTimerId) {
      alert("他のストップウォッチが動いています。先に停止または一時停止してください。");
      return;
    }
    setActiveTimerId(id);
    setTimerStartTimestamp(Date.now());
  };

  const handlePauseTimer = (id: string) => {
    if (activeTimerId !== id || !timerStartTimestamp) return;

    const endTimestamp = Date.now();
    // Using Math.floor to capture full minutes only
    const elapsedMinutes = Math.max(0, Math.floor((endTimestamp - timerStartTimestamp) / 60000));
    
    // Update actual minutes
    const entry = entries.find(e => e.id === id);
    if (entry) {
      updateEntry(id, { actualMinutes: entry.actualMinutes + elapsedMinutes });
    }

    setTimerStartTimestamp(null);
    // Keep activeTimerId to indicate "Paused" state
  };

  const handleResumeTimer = (id: string) => {
    if (activeTimerId !== id) return;
    setTimerStartTimestamp(Date.now());
  };

  const handleStopTimer = (id: string) => {
    if (activeTimerId !== id) return;

    // If running, calculate and commit final chunk
    if (timerStartTimestamp) {
      const endTimestamp = Date.now();
      const elapsedMinutes = Math.max(0, Math.floor((endTimestamp - timerStartTimestamp) / 60000));
      
      const entry = entries.find(e => e.id === id);
      if (entry) {
        updateEntry(id, { actualMinutes: entry.actualMinutes + elapsedMinutes });
      }
    }

    setActiveTimerId(null);
    setTimerStartTimestamp(null);
  };

  // Goal Actions
  const updateGoalScore = (subject: string, score: number) => {
    setGoals(goals.map(g => g.subject === subject ? { ...g, targetScore: score } : g));
  };

  const updateGoalActualScore = (subject: string, score: number | undefined) => {
    setGoals(goals.map(g => g.subject === subject ? { ...g, actualScore: score } : g));
  };

  const addTodo = (subject: string, text: string) => {
    setGoals(goals.map(g => {
      if (g.subject === subject) {
        return {
          ...g,
          todos: [...g.todos, { id: crypto.randomUUID(), text, isDone: false }]
        };
      }
      return g;
    }));
  };

  const toggleTodo = (subject: string, todoId: string) => {
    setGoals(goals.map(g => {
      if (g.subject === subject) {
        return {
          ...g,
          todos: g.todos.map(t => t.id === todoId ? { ...t, isDone: !t.isDone } : t)
        };
      }
      return g;
    }));
  };

  const deleteTodo = (subject: string, todoId: string) => {
    setGoals(goals.map(g => {
      if (g.subject === subject) {
        return {
          ...g,
          todos: g.todos.filter(t => t.id !== todoId)
        };
      }
      return g;
    }));
  };

  // Friend Actions
  const addFriend = (friendData: FriendStats) => {
    setFriends(prev => {
      const filtered = prev.filter(f => f.id !== friendData.id);
      return [...filtered, friendData].sort((a, b) => b.totalMinutes - a.totalMinutes);
    });
  };

  const removeFriend = (id: string) => {
    setFriends(prev => prev.filter(f => f.id !== id));
  };

  const getSummary = () => {
    const totalPlanned = entries.reduce((acc, cur) => acc + cur.plannedMinutes, 0);
    const totalActual = entries.reduce((acc, cur) => acc + cur.actualMinutes, 0);
    const completionCount = entries.filter(e => e.isDone).length;
    // Calculate goals met (where todo completion > 0 for now as a proxy, or actual > planned per subject logic)
    // Let's use "Number of subjects with > 0 actual minutes" as 'active subjects'
    const activeSubjects = new Set(entries.filter(e => e.actualMinutes > 0).map(e => e.subject)).size;
    
    return { totalPlanned, totalActual, completionCount, totalTasks: entries.length, activeSubjects };
  };

  const summary = getSummary();
  const todayForView = useMemo(() => getTodayOrDefault(), []);

  // --- Gemini AI Integration (Advice) ---

  const getAiAdvice = async () => {
    if (!process.env.API_KEY) {
      setAiAdvice("API Key is missing. Cannot generate advice.");
      setShowAiModal(true);
      return;
    }
    
    setAiLoading(true);
    setShowAiModal(true);
    setAiAdvice("");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const planSummary = entries.map(e => 
        `${e.dateStr}: ${e.subject} - ${e.content} (Plan: ${e.plannedMinutes}min, Actual: ${e.actualMinutes}min)`
      ).join('\n');

      const goalsSummary = goals.map(g => 
        `${g.subject}: Target ${g.targetScore}pts, Actual ${g.actualScore ?? 'N/A'}pts, Todos: ${g.todos.filter(t => t.isDone).length}/${g.todos.length}`
      ).join('\n');

      const prompt = `
        あなたは高校生の学習指導をするベテラン教師です。
        定期考査期間: 12/4(木)〜12/9(火)
        
        現在の学習データ:
        【目標と結果】
        ${goalsSummary}

        【学習履歴】
        ${planSummary || "まだ計画が入力されていません。"}

        以下の観点で短くアドバイスしてください（最大300文字程度）:
        1. 目標と現在の学習量のバランス（もし点数結果があればそれにも触れて）
        2. テスト日程（12/4開始）に向けたペース配分
        3. モチベーションを上げる励まし
        
        出力はMarkdown形式ではなくプレーンテキストで、優しく語りかける口調でお願いします。
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setAiAdvice(response.text || "アドバイスの生成に失敗しました。");
    } catch (error) {
      console.error(error);
      setAiAdvice("エラーが発生しました。もう一度お試しください。");
    } finally {
      setAiLoading(false);
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {/* Header */}
      <header className="bg-indigo-700 text-white p-4 shadow-lg sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab('home')}>
            <BookOpen className="w-6 h-6" />
            <h1 className="text-xl font-bold">定期考査学習管理 <span className="text-xs font-normal opacity-80 ml-2">11/27~12/9</span></h1>
          </div>
          <div className="flex space-x-1 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
            <button 
              onClick={() => setActiveTab('home')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${activeTab === 'home' ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            >
              <Home className="w-4 h-4" />
              <span>ホーム</span>
            </button>
             <button 
              onClick={() => setActiveTab('goals')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${activeTab === 'goals' ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            >
              <Target className="w-4 h-4" />
              <span>目標・ToDo</span>
            </button>
            <button 
              onClick={() => setActiveTab('plan')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${activeTab === 'plan' ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            >
              <Calendar className="w-4 h-4" />
              <span>スケジュール</span>
            </button>
            <button 
              onClick={() => setActiveTab('stats')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${activeTab === 'stats' ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>分析</span>
            </button>
            <button 
              onClick={() => setActiveTab('group')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${activeTab === 'group' ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            >
              <Users className="w-4 h-4" />
              <span>グループ</span>
            </button>
            <button 
              onClick={() => setActiveTab('analyze')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${activeTab === 'analyze' ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            >
              <ScanEye className="w-4 h-4" />
              <span>画像分析</span>
            </button>
            <div className="w-px h-6 bg-indigo-500 mx-1 hidden md:block"></div>
            <button
              onClick={getAiAdvice}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-bold bg-amber-400 text-indigo-900 hover:bg-amber-300 transition shadow-sm whitespace-nowrap"
            >
              <BrainCircuit className="w-4 h-4" />
              <span>AIコーチ</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto p-4">
        
        {/* Global Stats Summary - Show except on Analyze, Group, Home (Home has its own) */}
        {activeTab !== 'analyze' && activeTab !== 'group' && activeTab !== 'home' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="予定合計" value={`${(summary.totalPlanned / 60).toFixed(1)}h`} icon={<Clock className="text-indigo-500" />} />
            <StatCard label="実績合計" value={`${(summary.totalActual / 60).toFixed(1)}h`} icon={<CheckCircle2 className="text-emerald-500" />} />
            <StatCard label="進捗率" value={`${summary.totalPlanned > 0 ? Math.round((summary.totalActual / summary.totalPlanned) * 100) : 0}%`} icon={<BarChart3 className="text-blue-500" />} />
            <StatCard label="タスク消化" value={`${summary.completionCount}/${summary.totalTasks}`} icon={<ListTodo className="text-amber-500" />} />
          </div>
        )}

        {activeTab === 'home' && (
          <TopView 
            date={todayForView}
            entries={entries}
            goals={goals}
            activeTimerId={activeTimerId}
            timerStartTimestamp={timerStartTimestamp}
            onAdd={() => addEntry(todayForView)}
            onUpdate={updateEntry}
            onDelete={deleteEntry}
            onStartTimer={handleStartTimer}
            onStopTimer={handleStopTimer}
            onPauseTimer={handlePauseTimer}
            onResumeTimer={handleResumeTimer}
          />
        )}

        {activeTab === 'goals' && (
          <GoalsView 
            goals={goals} 
            onUpdateScore={updateGoalScore}
            onUpdateActualScore={updateGoalActualScore}
            onAddTodo={addTodo}
            onToggleTodo={toggleTodo}
            onDeleteTodo={deleteTodo}
          />
        )}

        {activeTab === 'plan' && (
          <div className="space-y-6">
            {SCHEDULE_DATES.map((date) => (
              <DaySection 
                key={date.toISOString()} 
                date={date} 
                entries={entries.filter(e => e.dateStr === getDateStr(date))}
                goals={goals}
                activeTimerId={activeTimerId}
                timerStartTimestamp={timerStartTimestamp}
                onAdd={() => addEntry(date)}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                onStartTimer={handleStartTimer}
                onStopTimer={handleStopTimer}
                onPauseTimer={handlePauseTimer}
                onResumeTimer={handleResumeTimer}
              />
            ))}
          </div>
        )}
        
        {activeTab === 'stats' && (
          <AnalyticsView entries={entries} goals={goals} />
        )}

        {activeTab === 'group' && (
          <GroupView 
            userName={userName}
            setUserName={setUserName}
            summary={summary}
            goals={goals}
            friends={friends}
            onAddFriend={addFriend}
            onRemoveFriend={removeFriend}
          />
        )}

        {activeTab === 'analyze' && (
          <ImageAnalysisView />
        )}
      </main>

      {/* AI Coach Advice Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setShowAiModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="flex items-center space-x-3 mb-4 text-indigo-700">
              <BrainCircuit className="w-8 h-8" />
              <h2 className="text-xl font-bold">AI学習コーチからのアドバイス</h2>
            </div>

            <div className="bg-indigo-50 rounded-lg p-4 min-h-[150px] text-gray-700 leading-relaxed whitespace-pre-wrap text-sm md:text-base">
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3 py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <p className="text-sm text-indigo-500">学習状況を分析中...</p>
                </div>
              ) : (
                aiAdvice
              )}
            </div>

            <div className="mt-6 text-right">
              <button 
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub Components ---

const StatCard = ({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
    <div className="p-3 bg-slate-50 rounded-full">{icon}</div>
    <div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

// --- Live Timer Component ---
const LiveTotalTimer = ({ baseMinutes, startTime, size = 'small' }: { baseMinutes: number, startTime: number, size?: 'small' | 'large' }) => {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    // Update every second
    const interval = setInterval(() => {
      const ms = Date.now() - startTime;
      // Use Math.floor to ensure full minutes only
      setElapsedMinutes(Math.floor(ms / 60000));
      setElapsedSeconds(Math.floor(ms / 1000) % 60);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const total = baseMinutes + elapsedMinutes;

  if (size === 'large') {
    return (
      <div className="text-center">
         <div className="text-6xl font-black text-slate-900 tabular-nums tracking-tighter">
            {total}<span className="text-2xl font-medium text-slate-400 ml-1">min</span>
            <span className="text-xl text-slate-300 ml-2 font-mono">{String(elapsedSeconds).padStart(2, '0')}s</span>
         </div>
      </div>
    );
  }

  return (
    <div className="w-12 p-1 text-right text-sm font-bold text-red-600 bg-red-50 rounded border border-red-200 flex items-center justify-end">
       {total}
       <span className="text-[10px] opacity-50 ml-0.5">m</span>
    </div>
  );
};

// --- Top View (Dashboard) ---
const TopView: React.FC<DaySectionProps> = ({
  date,
  entries,
  goals,
  activeTimerId,
  timerStartTimestamp,
  onAdd,
  onUpdate,
  onDelete,
  onStartTimer,
  onStopTimer,
  onPauseTimer,
  onResumeTimer
}) => {
  const activeEntry = entries.find(e => e.id === activeTimerId);
  const todayStr = getDateStr(date);
  const todayEntries = entries.filter(e => e.dateStr === todayStr);
  const plannedTotal = todayEntries.reduce((acc, cur) => acc + cur.plannedMinutes, 0);
  const actualTotal = todayEntries.reduce((acc, cur) => acc + cur.actualMinutes, 0);
  
  const todayTests = TEST_SCHEDULE[todayStr];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Date Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{formatDate(date)} の学習</h2>
          <p className="text-slate-500 text-sm">今日は何を勉強しますか？</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">今日の学習時間</div>
          <div className="text-2xl font-bold text-indigo-700">{(actualTotal/60).toFixed(1)} <span className="text-sm font-normal text-slate-400">/ {(plannedTotal/60).toFixed(1)} h</span></div>
        </div>
      </div>

      {/* Exam Alert Section (If today is an exam day) */}
      {todayTests && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-red-800 font-bold flex items-center mb-3">
            <GraduationCap className="w-6 h-6 mr-2" />
            本日の試験科目
          </h3>
          <div className="flex flex-wrap gap-2">
            {todayTests.map((subject, idx) => (
              <span key={subject} className="bg-white text-red-700 border border-red-100 px-4 py-2 rounded-lg font-bold shadow-sm flex items-center">
                <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center mr-2">{idx + 1}</span>
                {subject}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hero Timer Section */}
      <div className={`rounded-2xl shadow-sm border p-8 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-500 ${activeEntry ? 'bg-gradient-to-b from-indigo-50 to-white border-indigo-200' : 'bg-white border-slate-200 border-dashed'}`}>
        {activeEntry ? (
          <>
            <div className="absolute top-4 left-4 bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs font-bold animate-pulse flex items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
              計測中
            </div>
            
            <div className="text-center z-10 w-full max-w-md">
              <h3 className="text-lg font-medium text-slate-500 mb-1">{activeEntry.subject}</h3>
              <p className="text-xl font-bold text-slate-800 mb-6 truncate">{activeEntry.content || "内容未記入"}</p>
              
              <div className="mb-8">
                 {timerStartTimestamp ? (
                    <LiveTotalTimer baseMinutes={activeEntry.actualMinutes} startTime={timerStartTimestamp} size="large" />
                 ) : (
                    <div className="text-6xl font-black text-slate-400 tabular-nums tracking-tighter">
                      {activeEntry.actualMinutes}<span className="text-2xl font-medium text-slate-300 ml-1">min</span>
                      <span className="text-base text-amber-500 ml-2 font-bold block mt-2 text-center">PAUSED</span>
                    </div>
                 )}
              </div>

              <div className="flex items-center justify-center space-x-6">
                {timerStartTimestamp ? (
                   <button 
                      onClick={() => onPauseTimer(activeEntry.id)}
                      className="flex flex-col items-center space-y-1 group"
                   >
                      <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shadow-lg group-hover:bg-amber-200 transition transform group-hover:scale-105">
                        <Pause className="w-8 h-8 fill-current" />
                      </div>
                      <span className="text-xs font-bold text-amber-600">一時停止</span>
                   </button>
                ) : (
                   <button 
                      onClick={() => onResumeTimer(activeEntry.id)}
                      className="flex flex-col items-center space-y-1 group"
                   >
                      <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg group-hover:bg-indigo-700 transition transform group-hover:scale-105">
                        <Play className="w-8 h-8 fill-current ml-1" />
                      </div>
                      <span className="text-xs font-bold text-indigo-600">再開</span>
                   </button>
                )}

                <button 
                  onClick={() => onStopTimer(activeEntry.id)}
                  className="flex flex-col items-center space-y-1 group"
                >
                   <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shadow hover:bg-red-100 hover:text-red-500 transition">
                     <Square className="w-5 h-5 fill-current" />
                   </div>
                   <span className="text-xs text-slate-400">終了</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
               <Clock className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">学習を開始しましょう</h3>
            <p className="text-slate-500 text-sm mb-6">下のリストからタスクを選んで再生ボタンを押すか、<br/>新しい計画を追加してください。</p>
            <button 
              onClick={onAdd}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold shadow-lg hover:bg-indigo-700 transition flex items-center mx-auto"
            >
              <Plus className="w-5 h-5 mr-2" />
              新しい計画を追加
            </button>
          </div>
        )}
      </div>

      {/* Today's Task List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center">
            <ListTodo className="w-5 h-5 mr-2 text-indigo-500" />
            本日の計画リスト
          </h3>
          <button onClick={onAdd} className="text-sm text-indigo-600 font-bold hover:bg-indigo-50 px-3 py-1 rounded transition">
            + 追加
          </button>
        </div>
        
        <div className="divide-y divide-slate-100">
          {todayEntries.length === 0 && (
             <div className="p-8 text-center text-slate-400 text-sm">
                まだ本日の計画がありません。
             </div>
          )}
          {todayEntries.map(entry => {
             const subjectGoals = goals.find(g => g.subject === entry.subject);
             const availableTodos = subjectGoals ? subjectGoals.todos.filter(t => !t.isDone) : [];
             const isActive = activeTimerId === entry.id;

             return (
               <div key={entry.id} className={`p-4 hover:bg-slate-50 transition ${entry.isDone ? 'bg-emerald-50/30' : ''} ${isActive ? 'bg-indigo-50/30' : ''}`}>
                  <div className="flex items-start gap-4">
                    {/* Status Checkbox */}
                    <button 
                      onClick={() => onUpdate(entry.id, { isDone: !entry.isDone })}
                      className={`mt-1 shrink-0 ${entry.isDone ? 'text-emerald-500' : 'text-slate-300 hover:text-slate-400'}`}
                    >
                      <CheckCircle2 className="w-6 h-6" />
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <div className="flex items-center space-x-2 mb-1">
                             <select 
                                value={entry.subject}
                                onChange={(e) => onUpdate(entry.id, { subject: e.target.value })}
                                className="text-xs font-bold text-white bg-indigo-500 px-2 py-0.5 rounded cursor-pointer outline-none hover:bg-indigo-600"
                             >
                                {SUBJECTS.map(s => <option key={s} value={s} className="text-slate-900 bg-white">{s}</option>)}
                             </select>
                             <span className="text-xs text-slate-400">目標: {entry.plannedMinutes}分</span>
                          </div>
                          <input 
                            type="text" 
                            value={entry.content}
                            onChange={(e) => onUpdate(entry.id, { content: e.target.value })}
                            className={`w-full font-medium bg-transparent outline-none border-b border-transparent focus:border-indigo-300 ${entry.isDone ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                            placeholder="学習内容を入力"
                          />
                          {availableTodos.length > 0 && !entry.isDone && (
                             <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                     onUpdate(entry.id, { content: e.target.value });
                                     e.target.value = ""; // Reset select
                                  }
                                }}
                                className="w-full text-xs p-1.5 text-slate-500 border border-slate-100 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer outline-none"
                             >
                               <option value="">ToDoから選択...</option>
                               {availableTodos.map(todo => (
                                 <option key={todo.id} value={todo.text}>{todo.text}</option>
                               ))}
                             </select>
                          )}
                       </div>
                       
                       {/* Controls & Time */}
                       <div className="flex items-center justify-end gap-3">
                          <div className="text-right">
                             <div className="text-[10px] text-slate-400 uppercase">Actual</div>
                             <input 
                               type="number" 
                               value={entry.actualMinutes}
                               onChange={(e) => onUpdate(entry.id, { actualMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                               className={`w-16 text-right font-bold bg-transparent outline-none text-lg ${entry.actualMinutes >= entry.plannedMinutes && entry.plannedMinutes > 0 ? 'text-emerald-600' : 'text-slate-700'}`}
                               disabled={isActive && timerStartTimestamp !== null}
                             />
                             <span className="text-xs text-slate-400 ml-1">min</span>
                          </div>
                          
                          {!isActive && !entry.isDone && (
                            <button 
                              onClick={() => onStartTimer(entry.id)}
                              disabled={!!activeTimerId}
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition ${activeTimerId ? 'bg-slate-100 text-slate-300' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-600 hover:text-white shadow-sm'}`}
                            >
                               <Play className="w-5 h-5 fill-current ml-0.5" />
                            </button>
                          )}
                          
                          {isActive && (
                             <div className="px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full animate-pulse">
                                計測中
                             </div>
                          )}

                          <button 
                            onClick={() => onDelete(entry.id)}
                            className="p-2 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-full transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  </div>
               </div>
             );
          })}
        </div>
      </div>
    </div>
  );
};

// --- Goals & ToDo View ---

const GoalsView = ({ 
  goals, 
  onUpdateScore, 
  onUpdateActualScore,
  onAddTodo, 
  onToggleTodo, 
  onDeleteTodo 
}: { 
  goals: SubjectGoal[], 
  onUpdateScore: (s: string, score: number) => void,
  onUpdateActualScore: (s: string, score: number | undefined) => void,
  onAddTodo: (s: string, text: string) => void,
  onToggleTodo: (s: string, id: string) => void,
  onDeleteTodo: (s: string, id: string) => void
}) => {
  const [newTodoText, setNewTodoText] = useState<Record<string, string>>({});

  const handleAdd = (subject: string) => {
    if (!newTodoText[subject]?.trim()) return;
    onAddTodo(subject, newTodoText[subject]);
    setNewTodoText({ ...newTodoText, [subject]: '' });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {goals.map((goal) => (
        <div key={goal.subject} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-indigo-900 mb-3">{goal.subject}</h3>
            
            <div className="flex items-center space-x-4 bg-white p-2 rounded-lg border border-slate-200">
               {/* Target Score */}
               <div className="flex-1 flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">目標</span>
                  <div className="flex items-center">
                    <input 
                      type="number" 
                      min="0" 
                      max="100"
                      value={goal.targetScore}
                      onChange={(e) => onUpdateScore(goal.subject, parseInt(e.target.value) || 0)}
                      className="w-12 text-center text-lg font-bold text-indigo-700 border-b border-slate-200 focus:border-indigo-500 outline-none bg-transparent"
                    />
                    <span className="text-xs text-slate-400 ml-1">点</span>
                  </div>
               </div>
               
               <div className="w-px h-8 bg-slate-200"></div>

               {/* Actual Score */}
               <div className="flex-1 flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">結果</span>
                  <div className="flex items-center">
                    <input 
                      type="number" 
                      min="0" 
                      max="100"
                      placeholder="-"
                      value={goal.actualScore ?? ''}
                      onChange={(e) => onUpdateActualScore(goal.subject, e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-12 text-center text-lg font-bold text-slate-700 border-b border-slate-200 focus:border-emerald-500 outline-none placeholder-slate-300 bg-transparent"
                    />
                    <span className="text-xs text-slate-400 ml-1">点</span>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="p-4 flex-1 flex flex-col">
            <div className="space-y-2 mb-4 flex-1">
              {goal.todos.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">ToDoがありません</p>
              )}
              {goal.todos.map(todo => (
                <div key={todo.id} className="flex items-start space-x-2 group">
                  <button 
                    onClick={() => onToggleTodo(goal.subject, todo.id)}
                    className={`mt-0.5 shrink-0 transition ${todo.isDone ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-400'}`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <span className={`text-sm flex-1 break-words ${todo.isDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {todo.text}
                  </span>
                  <button 
                    onClick={() => onDeleteTodo(goal.subject, todo.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex space-x-2 pt-2 border-t border-slate-100 mt-auto">
              <input 
                type="text" 
                value={newTodoText[goal.subject] || ''}
                onChange={(e) => setNewTodoText({ ...newTodoText, [goal.subject]: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd(goal.subject)}
                placeholder="ToDoを追加..."
                className="flex-1 text-sm p-2 bg-white text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
              <button 
                onClick={() => handleAdd(goal.subject)}
                className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// --- Day Planner Section ---

const DaySection: React.FC<DaySectionProps> = ({ 
  date, 
  entries, 
  goals,
  activeTimerId,
  timerStartTimestamp,
  onAdd, 
  onUpdate, 
  onDelete,
  onStartTimer,
  onStopTimer,
  onPauseTimer,
  onResumeTimer
}) => {
  const dayTotalPlanned = entries.reduce((acc, cur) => acc + cur.plannedMinutes, 0);
  const dayTotalActual = entries.reduce((acc, cur) => acc + cur.actualMinutes, 0);
  
  const dayType = getDayType(date);
  const dateStr = getDateStr(date);
  const tests = TEST_SCHEDULE[dateStr];
  
  let headerColor = "bg-slate-50 border-slate-200";
  let badgeColor = "bg-indigo-600";
  let typeLabel = "学習日";
  
  if (dayType === 'exam') {
    headerColor = "bg-red-50 border-red-200";
    badgeColor = "bg-red-600";
    typeLabel = "試験当日";
  } else if (dayType === 'sunday') {
    headerColor = "bg-amber-50 border-amber-200";
    badgeColor = "bg-amber-500";
    typeLabel = "休日";
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden ${dayType === 'exam' ? 'border-red-200' : 'border-slate-200'}`}>
      <div className={`p-4 border-b flex flex-wrap gap-2 justify-between items-center ${headerColor}`}>
        <div className="flex items-center space-x-3">
          <div className={`${badgeColor} text-white px-3 py-1 rounded-lg font-bold text-sm shadow-sm`}>
            {formatDate(date)}
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${dayType === 'exam' ? 'text-red-600 border-red-200 bg-red-100' : 'text-slate-500 border-slate-200 bg-white'}`}>
            {typeLabel}
          </span>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <span className="text-slate-500 hidden sm:inline">予定: <span className="font-bold text-slate-700">{dayTotalPlanned}分</span></span>
          <span className="text-slate-500">実績: <span className={`font-bold ${dayTotalActual >= dayTotalPlanned && dayTotalPlanned > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>{dayTotalActual}分</span></span>
          <button 
            onClick={onAdd}
            className="ml-2 p-1.5 bg-white border border-slate-200 text-indigo-600 rounded-md hover:bg-indigo-50 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Test Schedule Display inside Day Card */}
      {tests && (
        <div className="bg-red-50/50 p-3 border-b border-red-100 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs font-bold text-red-500 whitespace-nowrap flex items-center">
            <GraduationCap className="w-3 h-3 mr-1" />
            試験科目:
          </span>
          {tests.map((subject, idx) => (
            <span key={subject} className="text-sm font-bold text-red-700 whitespace-nowrap flex items-center bg-white px-2 py-0.5 rounded border border-red-100 shadow-sm">
              <span className="w-4 h-4 rounded-full bg-red-100 text-red-600 text-[10px] flex items-center justify-center mr-1.5">{idx + 1}</span>
              {subject}
            </span>
          ))}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {entries.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">
             {dayType === 'exam' ? '明日の試験に向けて最終確認！' : '計画を追加して学習を開始しましょう。'}
          </div>
        )}
        {entries.map(entry => {
          // Find todos for this subject
          const subjectGoals = goals.find(g => g.subject === entry.subject);
          const availableTodos = subjectGoals ? subjectGoals.todos.filter(t => !t.isDone) : [];
          
          const isTimerActive = activeTimerId === entry.id;
          const isRunning = isTimerActive && timerStartTimestamp !== null;
          const isPaused = isTimerActive && timerStartTimestamp === null;

          return (
            <div key={entry.id} className={`p-4 transition-colors ${entry.isDone ? 'bg-emerald-50/50' : 'hover:bg-slate-50'} ${isTimerActive ? 'bg-red-50 hover:bg-red-50 ring-1 ring-red-100' : ''}`}>
              <div className="flex flex-col md:flex-row md:items-start gap-3">
                
                {/* Subject & Content Inputs */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3">
                    <select 
                      value={entry.subject} 
                      onChange={(e) => onUpdate(entry.id, { subject: e.target.value })}
                      className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white text-slate-900"
                    >
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-9 flex flex-col space-y-2">
                    <div className="flex space-x-2">
                       <input 
                        type="text" 
                        value={entry.content}
                        onChange={(e) => onUpdate(entry.id, { content: e.target.value })}
                        placeholder="学習内容"
                        className="flex-1 p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white text-slate-900"
                      />
                    </div>
                    {/* ToDo Selector (Visible if there are todos) */}
                    {availableTodos.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                             onUpdate(entry.id, { content: e.target.value });
                             e.target.value = ""; // Reset select
                          }
                        }}
                        className="w-full text-xs p-1.5 text-slate-500 border border-slate-100 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer outline-none"
                      >
                        <option value="">ToDoから選択...</option>
                        {availableTodos.map(todo => (
                          <option key={todo.id} value={todo.text}>{todo.text}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Time & Actions */}
                <div className="flex items-center gap-2 mt-2 md:mt-0 justify-end flex-wrap sm:flex-nowrap">
                  <div className="flex items-center bg-slate-100 rounded-lg p-1">
                    <span className="px-1 text-[10px] text-slate-400">予</span>
                    <input 
                      type="number" 
                      step="5"
                      value={entry.plannedMinutes}
                      onChange={(e) => onUpdate(entry.id, { plannedMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-12 p-1 text-right bg-transparent text-sm font-medium outline-none text-slate-900"
                    />
                  </div>

                  {/* Actual Time Display/Input */}
                  <div className={`flex items-center rounded-lg p-1 ${isRunning ? 'bg-red-50 border border-red-200' : 'bg-white border border-slate-200'}`}>
                     <span className={`px-1 text-[10px] ${isRunning ? 'text-red-400' : 'text-slate-400'}`}>実</span>
                     
                     {isRunning ? (
                       <LiveTotalTimer baseMinutes={entry.actualMinutes} startTime={timerStartTimestamp!} />
                     ) : (
                       <input 
                        type="number" 
                        value={entry.actualMinutes}
                        onChange={(e) => onUpdate(entry.id, { actualMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                        className={`w-12 p-1 text-right bg-transparent text-sm font-bold outline-none ${entry.actualMinutes >= entry.plannedMinutes && entry.plannedMinutes > 0 ? 'text-emerald-600' : 'text-slate-900'}`}
                      />
                     )}
                  </div>

                  {/* Timer Controls */}
                  <div className="flex items-center space-x-1">
                    {isTimerActive ? (
                      <>
                        {isRunning ? (
                          <button
                            onClick={() => onPauseTimer(entry.id)}
                            className="p-2 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 transition"
                            title="一時停止"
                          >
                            <Pause className="w-4 h-4 fill-current" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onResumeTimer(entry.id)}
                            className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition"
                            title="再開"
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                        )}
                        
                        <button
                          onClick={() => onStopTimer(entry.id)}
                          className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                          title="終了"
                        >
                          <Square className="w-4 h-4 fill-current" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onStartTimer(entry.id)}
                        disabled={!!activeTimerId}
                        className={`p-2 rounded-lg transition ${activeTimerId ? 'opacity-30 cursor-not-allowed bg-slate-100' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                        title="計測開始"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                    )}
                  </div>

                  <button 
                    onClick={() => onUpdate(entry.id, { isDone: !entry.isDone })}
                    className={`p-2 rounded-full transition ${entry.isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  
                  <button 
                    onClick={() => onDelete(entry.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AnalyticsView = ({ entries, goals }: { entries: StudyEntry[], goals: SubjectGoal[] }) => {
  // Aggregate data by subject
  const statsLookup = useMemo(() => {
    const stats: Record<string, { planned: number, actual: number }> = {};
    SUBJECTS.forEach(s => stats[s] = { planned: 0, actual: 0 });
    
    entries.forEach(e => {
      if (stats[e.subject]) {
        stats[e.subject].planned += e.plannedMinutes;
        stats[e.subject].actual += e.actualMinutes;
      }
    });
    return stats;
  }, [entries]);

  const subjectStats = useMemo(() => {
    // Explicit type cast to fix inference issues
    const allStats = Object.entries(statsLookup) as [string, { planned: number, actual: number }][];
    return allStats
      .filter(([_, val]) => val.planned > 0 || val.actual > 0)
      .sort((a, b) => b[1].actual - a[1].actual);
  }, [statsLookup]);

  // Calculate maxMinutes outside the loop
  const maxMinutes = useMemo(() => {
    if (subjectStats.length === 0) return 60;
    return Math.max(...subjectStats.map(([, d]) => Math.max(d.planned, d.actual)), 60);
  }, [subjectStats]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-indigo-600" />
            科目別学習時間
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {subjectStats.length === 0 ? (
              <p className="text-slate-500 text-center py-8">データがありません</p>
            ) : (
              subjectStats.map(([subject, data]) => {
                const isGoalMet = data.actual >= data.planned && data.planned > 0;
                
                // Achievement Rate
                const achievementRate = data.planned > 0 ? (data.actual / data.planned) * 100 : 0;

                // Percentages for bar
                const progressPercentage = Math.min(100, (data.actual / maxMinutes) * 100);
                const planPercentage = Math.min(100, (data.planned / maxMinutes) * 100);

                let gradientClass = "";
                if (achievementRate >= 100) {
                    gradientClass = "bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.4)]";
                } else if (achievementRate >= 75) {
                    gradientClass = "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500";
                } else if (achievementRate >= 50) {
                    gradientClass = "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500";
                } else if (achievementRate >= 25) {
                    gradientClass = "bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400";
                } else {
                    gradientClass = "bg-gradient-to-r from-sky-300 to-cyan-400";
                }

                return (
                  <div key={subject} className={`mb-4 group p-2 rounded-lg transition-colors ${isGoalMet ? 'bg-emerald-50/50 border border-emerald-100' : 'hover:bg-slate-50'}`}>
                    <div className="flex justify-between text-sm mb-1.5 items-end">
                      <span className={`font-medium flex items-center ${isGoalMet ? 'text-emerald-900' : 'text-slate-700'}`}>
                        {subject}
                        {isGoalMet && <Trophy className="w-3 h-3 text-amber-500 ml-1.5 animate-pulse" />}
                      </span>
                      <span className="text-slate-500 text-xs font-mono">
                         <span className={`font-bold ${isGoalMet ? "text-emerald-600" : "text-slate-700"}`}>{data.actual}</span>
                         <span className="mx-1 text-slate-300">/</span>
                         <span>{data.planned}分</span>
                         <span className="ml-2 text-[10px] text-slate-400">({Math.round(achievementRate)}%)</span>
                      </span>
                    </div>
                    
                    <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex relative shadow-inner">
                      <div 
                        className="absolute top-0 left-0 h-full bg-slate-200 z-0 border-r border-slate-300/50"
                        style={{ width: `${planPercentage}%` }}
                      />
                      <div 
                        className={`absolute top-0 left-0 h-full z-10 transition-all duration-1000 ease-out rounded-full ${gradientClass}`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                      {!isGoalMet && data.planned > 0 && (
                         <div 
                            className="absolute top-0 w-0.5 h-full bg-slate-400/50 z-20"
                            style={{ left: `${planPercentage}%` }}
                         />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Goals List Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
            <Trophy className="w-5 h-5 mr-2 text-amber-500" />
            目標設定・達成状況
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {goals.map(goal => {
               const stat = statsLookup[goal.subject];
               const isTimeGoalMet = stat && stat.actual >= stat.planned && stat.planned > 0;
               
               // Check if score is met (only if actual score is entered)
               const hasScore = goal.actualScore !== undefined && goal.actualScore >= 0;
               const isScoreMet = hasScore && (goal.actualScore! >= goal.targetScore);
               
               // Highlight logic: Prioritize Score Achievement
               const isHighlighted = isScoreMet;

               return (
                <div key={goal.subject} className={`flex items-center justify-between p-3 rounded-lg border transition ${isHighlighted ? 'bg-amber-100 border-amber-300 shadow-sm' : 'bg-slate-50 border-transparent'}`}>
                  <div className="flex items-center space-x-2">
                     {isHighlighted && <Award className="w-5 h-5 text-amber-600 animate-bounce" />}
                     <div className={`font-medium text-sm ${isHighlighted ? 'text-amber-900 font-bold' : 'text-slate-700'}`}>{goal.subject}</div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {/* Score Display */}
                    <div className="flex flex-col items-end">
                       <div className="flex items-center space-x-1 text-xs">
                          <Target className={`w-3 h-3 ${isHighlighted ? 'text-amber-700' : 'text-indigo-500'}`} />
                          <span className={isHighlighted ? 'text-amber-900 font-bold' : 'text-indigo-700'}>
                             {goal.targetScore}
                             <span className="mx-0.5 text-slate-400">/</span>
                             {hasScore ? (
                               <span className={isScoreMet ? 'text-amber-700' : 'text-slate-600'}>{goal.actualScore}</span>
                             ) : '-'}
                          </span>
                       </div>
                    </div>

                    {/* Time Status */}
                    {stat && (stat.planned > 0 || stat.actual > 0) && (
                       <div className="flex items-center space-x-1 text-xs" title="学習時間">
                          <Clock className={`w-3 h-3 ${isTimeGoalMet ? 'text-emerald-500' : 'text-slate-400'}`} />
                          <span className={isTimeGoalMet ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                             {Math.round(stat.actual / 60 * 10) / 10}h
                          </span>
                       </div>
                    )}
                  </div>
                </div>
               );
            })}
          </div>
        </div>
      </div>

      {/* Tip Card */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-bold text-amber-800 text-sm">目標・実績の確認</h4>
          <p className="text-sm text-amber-700 mt-1">
            点数の結果（Actual Score）が目標（Target Score）を上回った科目は、リスト上でゴールドにハイライトされます。「目標・ToDo」タブから点数を入力してください。
          </p>
        </div>
      </div>
    </div>
  );
};

// --- Group / Share View ---

const GroupView = ({ 
  userName, 
  setUserName, 
  summary, 
  goals,
  friends,
  onAddFriend,
  onRemoveFriend
}: { 
  userName: string, 
  setUserName: (n: string) => void,
  summary: any,
  goals: SubjectGoal[],
  friends: FriendStats[],
  onAddFriend: (f: FriendStats) => void,
  onRemoveFriend: (id: string) => void
}) => {
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [showCopySuccess, setShowCopySuccess] = useState(false);

  // Generate My Share Code
  const myData: FriendStats = {
    id: useMemo(() => crypto.randomUUID(), []), // Stable ID for session
    name: userName,
    totalMinutes: summary.totalActual,
    goalsMetCount: goals.filter(g => g.todos.length > 0 && g.todos.every(t => t.isDone)).length, // Simple metric
    lastUpdated: Date.now()
  };

  const shareCode = useMemo(() => {
    try {
      return btoa(JSON.stringify(myData));
    } catch (e) {
      return "";
    }
  }, [myData]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(shareCode);
    setShowCopySuccess(true);
    setTimeout(() => setShowCopySuccess(false), 2000);
  };

  const handleAddFriend = () => {
    if (!friendCodeInput.trim()) return;
    try {
      const decoded = atob(friendCodeInput);
      const data: FriendStats = JSON.parse(decoded);
      if (!data.id || !data.name) throw new Error("Invalid Data");
      onAddFriend(data);
      setFriendCodeInput("");
      alert(`${data.name}さんを追加しました！`);
    } catch (e) {
      alert("無効な共有コードです。");
    }
  };

  // Combine me + friends for leaderboard
  const leaderboard = [...friends, myData].sort((a, b) => b.totalMinutes - a.totalMinutes);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* My Profile Card */}
      <div className="bg-white rounded-xl shadow-md border border-indigo-100 overflow-hidden">
        <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <h3 className="font-bold">マイルーム</h3>
          </div>
          <span className="text-xs bg-indigo-500 px-2 py-1 rounded">最終更新: {new Date().toLocaleTimeString()}</span>
        </div>
        
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 w-full space-y-4">
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">あなたの名前</label>
                <input 
                  type="text" 
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full text-lg font-bold p-2 border-b-2 border-indigo-100 focus:border-indigo-500 outline-none transition bg-transparent text-slate-900"
                  placeholder="名前を入力"
                />
              </div>
              <div className="flex space-x-4">
                <div className="bg-slate-50 p-3 rounded-lg flex-1 text-center">
                  <p className="text-xs text-slate-400">総学習時間</p>
                  <p className="text-xl font-bold text-indigo-600">{(summary.totalActual / 60).toFixed(1)}<span className="text-sm text-slate-400 ml-1">h</span></p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg flex-1 text-center">
                  <p className="text-xs text-slate-400">達成ToDo</p>
                  <p className="text-xl font-bold text-emerald-600">{summary.completionCount}</p>
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto flex flex-col items-center justify-center p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-xs text-indigo-800 font-bold mb-2">友達にデータを共有</p>
              <div className="flex items-center space-x-2 w-full">
                <input 
                  readOnly 
                  value={shareCode} 
                  className="flex-1 bg-white text-slate-400 text-xs p-2 rounded border border-indigo-200 truncate max-w-[150px]" 
                />
                <button 
                  onClick={handleCopyCode}
                  className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition flex items-center space-x-1 shrink-0"
                >
                  {showCopySuccess ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="text-xs font-bold">{showCopySuccess ? '完了' : 'コードをコピー'}</span>
                </button>
              </div>
              <p className="text-[10px] text-indigo-400 mt-2 text-center">このコードを友達に送って、登録してもらいましょう。</p>
            </div>
          </div>
        </div>
      </div>

      {/* Classmates List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Leaderboard */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center">
            <Trophy className="w-5 h-5 text-amber-500 mr-2" />
            グループランキング
          </h3>
          <div className="space-y-2">
            {leaderboard.map((member, idx) => (
              <div key={member.id} className={`flex items-center p-3 rounded-lg ${member.id === myData.id ? 'bg-indigo-50 border border-indigo-100' : 'bg-white border border-slate-100'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${idx === 0 ? 'bg-amber-100 text-amber-600' : idx === 1 ? 'bg-slate-100 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${member.id === myData.id ? 'text-indigo-700' : 'text-slate-700'}`}>{member.name} {member.id === myData.id && '(あなた)'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-800">{(member.totalMinutes / 60).toFixed(1)}h</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Friend */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center">
            <UserPlus className="w-5 h-5 text-emerald-500 mr-2" />
            メンバーを追加
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            友達から送られてきた「共有コード」を入力して、学習状況を共有しましょう。
          </p>
          
          <div className="space-y-3 mt-auto">
            <textarea
              value={friendCodeInput}
              onChange={(e) => setFriendCodeInput(e.target.value)}
              placeholder="ここに共有コードを貼り付け..."
              className="w-full p-3 border border-slate-200 rounded-lg text-xs font-mono h-24 focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50 text-slate-900"
            />
            <button 
              onClick={handleAddFriend}
              disabled={!friendCodeInput}
              className={`w-full py-2 rounded-lg font-bold text-white transition ${!friendCodeInput ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600'}`}
            >
              追加する
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100">
             <h4 className="text-xs font-bold text-slate-500 mb-2">登録済みメンバー</h4>
             {friends.length === 0 ? (
               <p className="text-xs text-slate-400">まだメンバーがいません。</p>
             ) : (
               <div className="space-y-2">
                 {friends.map(f => (
                   <div key={f.id} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded">
                      <span>{f.name}</span>
                      <button onClick={() => onRemoveFriend(f.id)} className="text-slate-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>

      </div>
    </div>
  );
};

// --- Image Analysis Component ---

const ImageAnalysisView = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("この画像に写っている問題の解き方やポイントを、高校生にもわかりやすく解説してください。");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setMimeType(file.type);
      setResult(""); // Clear previous result
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setSelectedImage(null);
    setResult("");
    setMimeType("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzeImage = async () => {
    if (!selectedImage || !process.env.API_KEY) return;

    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Extract base64 data from data URL
      const base64Data = selectedImage.split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            {
              text: prompt
            }
          ]
        }
      });

      setResult(response.text || "解説を生成できませんでした。");
    } catch (error) {
      console.error("Error analyzing image:", error);
      setResult("エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <ScanEye className="w-5 h-5 mr-2 text-indigo-600" />
          画像で質問・解説 (Powered by Gemini 3.0 Pro)
        </h3>
        <p className="text-slate-500 text-sm mb-6">
          教科書やノート、問題集の写真をアップロードして、Geminiに解説してもらいましょう。
        </p>

        {/* Image Upload Area */}
        {!selectedImage ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl h-64 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition group"
          >
            <div className="p-4 bg-indigo-50 rounded-full mb-4 group-hover:bg-indigo-100 transition">
              <Upload className="w-8 h-8 text-indigo-500" />
            </div>
            <p className="text-slate-600 font-medium">写真をアップロード</p>
            <p className="text-slate-400 text-xs mt-1">タップして撮影またはファイルを選択</p>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-slate-900 flex justify-center items-center max-h-[500px]">
            <img src={selectedImage} alt="Uploaded study material" className="max-w-full max-h-[500px] object-contain" />
            <button 
              onClick={handleClear}
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange} 
          accept="image/*" 
          capture="environment"
          className="hidden" 
        />

        {/* Prompt Input */}
        {selectedImage && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">質問内容</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm min-h-[80px]"
                placeholder="聞きたいことを入力してください..."
              />
            </div>
            
            <button 
              onClick={analyzeImage}
              disabled={loading}
              className={`w-full py-3 rounded-lg text-white font-bold flex items-center justify-center space-x-2 transition ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>分析中...</span>
                </>
              ) : (
                <>
                  <BrainCircuit className="w-5 h-5" />
                  <span>解説を作成する</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Result Display */}
      {result && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center space-x-2 mb-4 text-indigo-700">
            <BrainCircuit className="w-6 h-6" />
            <h3 className="font-bold">AIによる解説</h3>
          </div>
          <div className="prose prose-indigo prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
            {result}
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);