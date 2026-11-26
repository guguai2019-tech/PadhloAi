import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import type { AppSettings, StudyGoal, StudyTask } from '../types';
import { generateAI, parseSafeJson } from '../utils/aiClient';

interface StudyPlannerProps {
  settings: AppSettings;
  tasks: StudyTask[];
  goals: StudyGoal[];
  onUpdateTasks: (tasks: StudyTask[]) => void;
  onUpdateGoals: (goals: StudyGoal[]) => void;
}

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day: { type: 'STRING' },
          timeSlot: { type: 'STRING' },
          subject: { type: 'STRING' },
          topic: { type: 'STRING' },
          durationMinutes: { type: 'INTEGER' },
          type: { type: 'STRING' },
        },
        required: ['day', 'timeSlot', 'subject', 'topic', 'durationMinutes', 'type'],
      },
    },
  },
  required: ['tasks'],
};

export const StudyPlanner: React.FC<StudyPlannerProps> = ({
  settings,
  tasks,
  goals,
  onUpdateTasks,
  onUpdateGoals,
}) => {
  const [examTarget, setExamTarget] = useState('Final Board / Competitive Exam');
  const [subjectsInput, setSubjectsInput] = useState('Physics, Chemistry, Mathematics, English');
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [daysCount, setDaysCount] = useState(7);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual Goal input
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalSubject, setNewGoalSubject] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('18:00');

  // Manual Task input
  const [customSubject, setCustomSubject] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [customDay, setCustomDay] = useState('Today');

  const handleGeneratePlan = async () => {
    if (!subjectsInput.trim()) {
      setErrorMsg('Enter at least one subject.');
      return;
    }
    setGenerating(true);
    setErrorMsg(null);

    const prompt = `Create a realistic ${daysCount}-day structured study schedule for "${examTarget}" covering subjects: ${subjectsInput}.
Daily study budget: ${hoursPerDay} hours/day.
Include a balanced mix of Learn, Practice, Revision, and Mock Test sessions with specific actionable topics.
Return ONLY valid JSON matching the schema. Set "type" to one of: "Learn", "Practice", "Revision", "Mock Test".`;

    try {
      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: settings.language,
        prompt,
        responseMimeType: 'application/json',
        responseSchema: PLAN_SCHEMA,
      });

      const parsed = parseSafeJson<{
        tasks: Array<{
          day: string;
          timeSlot: string;
          subject: string;
          topic: string;
          durationMinutes: number;
          type: string;
        }>;
      }>(res.text);

      const newTasks: StudyTask[] = (parsed.tasks || []).map((t, idx) => {
        const normalizedType = (['Learn', 'Practice', 'Revision', 'Mock Test'].includes(t.type)
          ? t.type
          : 'Learn') as StudyTask['type'];
        return {
          id: `task-${Date.now()}-${idx}`,
          day: t.day,
          timeSlot: t.timeSlot,
          subject: t.subject,
          topic: t.topic,
          durationMinutes: t.durationMinutes || 45,
          type: normalizedType,
          completed: false,
        };
      });

      onUpdateTasks([...newTasks, ...tasks]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate study plan.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddGoal = () => {
    if (!newGoalTitle.trim()) return;
    const goal: StudyGoal = {
      id: `goal-${Date.now()}`,
      title: newGoalTitle.trim(),
      subject: newGoalSubject.trim() || 'General',
      targetDate: newGoalDate || new Date().toISOString().slice(0, 10),
      progress: 0,
      reminderTime: newReminderTime,
      completed: false,
    };
    onUpdateGoals([goal, ...goals]);
    setNewGoalTitle('');
    setNewGoalSubject('');
  };

  const handleAddCustomTask = () => {
    if (!customTopic.trim()) return;
    const task: StudyTask = {
      id: `task-${Date.now()}`,
      day: customDay.trim() || 'Today',
      timeSlot: 'Flexible',
      subject: customSubject.trim() || 'General',
      topic: customTopic.trim(),
      durationMinutes: 45,
      type: 'Learn',
      completed: false,
    };
    onUpdateTasks([task, ...tasks]);
    setCustomTopic('');
  };

  const completedTasks = tasks.filter((t) => t.completed).length;
  const completionPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              AI Study Planner & Progress Tracker
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Build personalized daily study schedules, exam prep plans, revision reminders, and track syllabus goals.
            </p>
          </div>
          {tasks.length > 0 && (
            <div className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums">
              Progress: {completedTasks}/{tasks.length} sessions ({completionPct}%)
            </div>
          )}
        </div>

        {/* AI Generator Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="font-semibold text-base">Generate AI Study Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Exam / Target
              </label>
              <input
                type="text"
                value={examTarget}
                onChange={(e) => setExamTarget(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Subjects & Weak Topics
              </label>
              <input
                type="text"
                value={subjectsInput}
                onChange={(e) => setSubjectsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Hours/Day
                </label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value) || 3)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Days
                </label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={daysCount}
                  onChange={(e) => setDaysCount(Number(e.target.value) || 7)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
                />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGeneratePlan()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Building Study Plan...</span>
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  <span>Generate Study Schedule</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Schedule Tasks */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Daily Study Sessions</h2>
              {tasks.length > 0 && (
                <button
                  type="button"
                  onClick={() => onUpdateTasks([])}
                  className="text-xs text-red-500 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Quick Add Task */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={customDay}
                onChange={(e) => setCustomDay(e.target.value)}
                placeholder="Day"
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Subject"
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Topic to study..."
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <button
                type="button"
                onClick={handleAddCustomTask}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Task</span>
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No study sessions yet. Generate an AI schedule above or add a custom study task.
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border transition-colors ${
                      task.completed
                        ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 opacity-75'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTasks(
                          tasks.map((t) =>
                            t.id === task.id ? { ...t, completed: !t.completed } : t,
                          ),
                        )
                      }
                      className="flex items-start gap-3 text-left flex-1"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div
                          className={`text-sm font-medium ${
                            task.completed ? 'line-through text-slate-500' : ''
                          }`}
                        >
                          {task.topic}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {task.day} · {task.timeSlot} · {task.subject} · {task.type} ·{' '}
                          {task.durationMinutes} min
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateTasks(tasks.filter((t) => t.id !== task.id))}
                      className="p-1 text-slate-400 hover:text-red-500"
                      aria-label="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Study Goals & Revision Reminders */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 h-fit">
            <div className="flex items-center gap-2 font-semibold text-base">
              <Target className="w-4 h-4 text-teal-600" />
              <span>Study Goals & Revision Reminders</span>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="Goal title (e.g. Finish Organic Chemistry Ch 1-4)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newGoalSubject}
                  onChange={(e) => setNewGoalSubject(e.target.value)}
                  placeholder="Subject"
                  className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
                <input
                  type="date"
                  value={newGoalDate}
                  onChange={(e) => setNewGoalDate(e.target.value)}
                  className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
                <input
                  type="time"
                  value={newReminderTime}
                  onChange={(e) => setNewReminderTime(e.target.value)}
                  className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleAddGoal}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Study Goal & Reminder</span>
              </button>
            </div>

            {goals.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Add syllabus milestones and daily revision reminders to track your exam readiness.
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((g) => (
                  <div
                    key={g.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{g.title}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 tabular-nums">
                          <span>{g.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span>Target {g.targetDate}</span>
                          {g.reminderTime && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <Bell className="w-3 h-3" />
                                {g.reminderTime}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateGoals(goals.filter((item) => item.id !== g.id))}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={g.progress}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateGoals(
                            goals.map((item) =>
                              item.id === g.id
                                ? { ...item, progress: val, completed: val === 100 }
                                : item,
                            ),
                          );
                        }}
                        className="flex-1 accent-teal-600"
                      />
                      <span className="text-xs font-mono font-semibold w-10 text-right tabular-nums">
                        {g.progress}%
                      </span>
                    </div>
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
