import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Circle,
  Clock3,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import toast from 'react-hot-toast';
import client from '../api/client';
import PaginationControls from '../components/common/PaginationControls';
import { getCurrentUser, isAdminUser } from '../utils/userAccess';

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type ReminderFormState = {
  title: string;
  description: string;
  dueDate: string;
  type: string;
};

type ReminderItem = {
  id: number;
  title: string;
  description?: string | null;
  dueDate: string;
  type?: string | null;
  isCompleted?: boolean;
  createdAt?: string;
  user?: { username?: string } | null;
};

const EMPTY_FORM: ReminderFormState = {
  title: '',
  description: '',
  dueDate: '',
  type: 'general',
};

const TYPE_META: Record<string, { label: string; tone: string; dot: string; iconTone: string }> = {
  general: { label: 'Общее', tone: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', iconTone: 'bg-slate-100 text-slate-500' },
  call: { label: 'Звонки клиентам', tone: 'bg-blue-50 text-blue-600', dot: 'bg-blue-500', iconTone: 'bg-blue-50 text-blue-600' },
  supplier: { label: 'Заказы поставщикам', tone: 'bg-orange-50 text-orange-600', dot: 'bg-orange-500', iconTone: 'bg-orange-50 text-orange-600' },
  stock: { label: 'Склад и учет', tone: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500', iconTone: 'bg-emerald-50 text-emerald-600' },
  finance: { label: 'Финансы', tone: 'bg-violet-50 text-violet-600', dot: 'bg-violet-500', iconTone: 'bg-violet-50 text-violet-600' },
};

const PRIORITY_META = {
  overdue: { label: 'Высокий', tone: 'bg-rose-50 text-rose-500 border-rose-200' },
  today: { label: 'Средний', tone: 'bg-amber-50 text-amber-500 border-amber-200' },
  upcoming: { label: 'Низкий', tone: 'bg-emerald-50 text-emerald-500 border-emerald-200' },
  completed: { label: 'Выполнено', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseReminderDate(value: string) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  }

  return new Date(normalized);
}

function sameDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function getReminderBucket(reminder: ReminderItem, now: Date) {
  if (reminder.isCompleted) return 'completed' as const;
  const dueDate = parseReminderDate(reminder.dueDate);
  const today = startOfDay(now);
  const dueStart = startOfDay(dueDate);
  if (dueStart.getTime() < today.getTime()) return 'overdue' as const;
  if (sameDay(dueDate, now)) return 'today' as const;
  return 'upcoming' as const;
}

function buildCalendarDays(activeMonth: Date) {
  const firstDay = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startWeekday);
  return Array.from({ length: 35 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function formatDueLabel(value: string, bucket: 'overdue' | 'today' | 'upcoming' | 'completed') {
  const date = parseReminderDate(value);
  if (bucket === 'today') {
    return 'Сегодня';
  }
  if (bucket === 'overdue') {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function getTypeMeta(type?: string | null) {
  return TYPE_META[String(type || 'general').toLowerCase()] || TYPE_META.general;
}

export default function RemindersView() {
  const reminderPageSize = 6;
  const currentUser = getCurrentUser();
  const canDeleteReminder = isAdminUser(currentUser);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<ReminderItem | null>(null);
  const [reminderForm, setReminderForm] = useState<ReminderFormState>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'today' | 'overdue' | 'upcoming' | 'completed'>('all');
  const [activeMonth, setActiveMonth] = useState(() => startOfDay(new Date()));
  const [currentPage, setCurrentPage] = useState(1);

  const fetchReminders = async () => {
    try {
      const res = await client.get('/reminders');
      setReminders(Array.isArray(res.data) ? res.data : []);
      window.dispatchEvent(new Event('reminders-updated'));
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при загрузке напоминаний');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  useEffect(() => {
    if (!showModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const closeModal = () => {
    setShowModal(false);
    setSelectedReminder(null);
    setReminderForm(EMPTY_FORM);
  };

  const openCreateModal = () => {
    setSelectedReminder(null);
    setReminderForm({ ...EMPTY_FORM, dueDate: formatDateInputValue(new Date()) });
    setShowModal(true);
  };

  const openReminderModal = (reminder: ReminderItem) => {
    setSelectedReminder(reminder);
    setReminderForm({
      title: reminder.title || '',
      description: reminder.description || '',
      dueDate: String(reminder.dueDate || '').slice(0, 10),
      type: reminder.type || 'general',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...reminderForm, dueDate: `${reminderForm.dueDate}T12:00:00` };
      if (selectedReminder?.id) {
        await client.put(`/reminders/${selectedReminder.id}`, payload);
        toast.success('Напоминание обновлено');
      } else {
        await client.post('/reminders', payload);
        toast.success('Напоминание создано');
      }
      closeModal();
      fetchReminders();
    } catch {
      toast.error(selectedReminder ? 'Ошибка при обновлении напоминания' : 'Ошибка при создании напоминания');
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await client.put(`/reminders/${id}/complete`);
      toast.success('Напоминание выполнено');
      if (selectedReminder?.id === id) closeModal();
      fetchReminders();
    } catch {
      toast.error('Не удалось отметить задачу');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await client.delete(`/reminders/${id}`);
      toast.success('Напоминание удалено');
      if (selectedReminder?.id === id) closeModal();
      fetchReminders();
    } catch (err: any) {
      toast.error(err?.response?.status === 403 ? 'Удалять напоминания может только админ' : 'Ошибка удаления');
    }
  };

  const now = useMemo(() => new Date(), [reminders]);

  const filteredReminders = useMemo(() => {
    return reminders
      .filter((reminder) => {
        const haystack = `${reminder.title || ''} ${reminder.description || ''}`.toLowerCase();
        if (!haystack.includes(searchTerm.toLowerCase())) return false;
        const bucket = getReminderBucket(reminder, now);
        return filterTab === 'all' ? true : bucket === filterTab;
      })
      .sort((a, b) => parseReminderDate(a.dueDate || a.createdAt || '').getTime() - parseReminderDate(b.dueDate || b.createdAt || '').getTime());
  }, [filterTab, now, reminders, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredReminders.length / reminderPageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTab]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedReminders = useMemo(() => {
    const startIndex = (currentPage - 1) * reminderPageSize;
    return filteredReminders.slice(startIndex, startIndex + reminderPageSize);
  }, [currentPage, filteredReminders]);

  const groupedReminders = useMemo(() => {
    const groups = {
      overdue: [] as ReminderItem[],
      today: [] as ReminderItem[],
      upcoming: [] as ReminderItem[],
      completed: [] as ReminderItem[],
    };
    filteredReminders.forEach((reminder) => {
      groups[getReminderBucket(reminder, now)].push(reminder);
    });
    return groups;
  }, [filteredReminders, now]);

  const paginatedGroupedReminders = useMemo(() => {
    const groups = {
      overdue: [] as ReminderItem[],
      today: [] as ReminderItem[],
      upcoming: [] as ReminderItem[],
      completed: [] as ReminderItem[],
    };
    paginatedReminders.forEach((reminder) => {
      groups[getReminderBucket(reminder, now)].push(reminder);
    });
    return groups;
  }, [now, paginatedReminders]);

  const stats = useMemo(() => {
    const completed = reminders.filter((item) => item.isCompleted).length;
    const overdue = reminders.filter((item) => getReminderBucket(item, now) === 'overdue').length;
    const completionRate = reminders.length > 0 ? Math.round((completed / reminders.length) * 100) : 0;
    return { completed, overdue, completionRate };
  }, [reminders, now]);

  const categoryCounts = useMemo(() => {
    return reminders.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.type || 'general').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [reminders]);

  const monthDays = useMemo(() => buildCalendarDays(activeMonth), [activeMonth]);
  const activeMonthLabel = activeMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const sections = [
    { key: 'overdue', title: 'Просрочено', items: paginatedGroupedReminders.overdue, accent: 'text-rose-500' },
    { key: 'today', title: 'Сегодня', items: paginatedGroupedReminders.today, accent: 'text-slate-900' },
    { key: 'upcoming', title: 'Предстоящие', items: paginatedGroupedReminders.upcoming, accent: 'text-slate-900' },
    { key: 'completed', title: 'Выполнены', items: paginatedGroupedReminders.completed, accent: 'text-slate-400' },
  ] as const;
  const reminderTabs = [
    { key: 'all', label: 'Все', count: reminders.length },
    { key: 'today', label: 'Сегодня', count: groupedReminders.today.length },
    { key: 'overdue', label: 'Просрочены', count: groupedReminders.overdue.length },
    { key: 'upcoming', label: 'Скоро', count: groupedReminders.upcoming.length },
    { key: 'completed', label: 'Выполнены', count: groupedReminders.completed.length },
  ] as const;

  return (
    <div className="app-page-shell">
      <div className="w-full">
        <div className="overflow-hidden rounded-[28px] border border-[#dfe4ff] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 border-b border-[#eceffd] px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
            <h1 className="text-4xl font-medium tracking-tight text-slate-900">Напоминания</h1>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[250px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={16} />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Поиск задач..."
                  className="w-full rounded-2xl border border-[#e6e8f5] bg-[#f7f8ff] py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition-all focus:border-violet-300 focus:bg-white"
                />
              </div>

              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#7c4dff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(124,77,255,0.24)] transition-all hover:bg-[#6e42ee]"
              >
                <Plus size={16} />
                Новая задача
              </button>
            </div>
          </div>

          <div className="grid gap-5 bg-[#f8f9ff] p-5 md:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="rounded-[24px] border border-[#e7ebff] bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
                  <div className="min-w-0">
                    <div className="sm:hidden">
                      <select
                        value={filterTab}
                        onChange={(e) => setFilterTab(e.target.value as typeof filterTab)}
                        className="w-full rounded-[18px] border border-[#dfe5ff] bg-[#f7f8ff] px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-violet-300 focus:bg-white"
                      >
                        {reminderTabs.map((tab) => (
                          <option key={tab.key} value={tab.key}>
                            {tab.label} ({tab.count})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="hidden min-w-0 grid-cols-5 gap-1 rounded-[20px] bg-[#f7f8ff] p-1 sm:grid">
                      {reminderTabs.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setFilterTab(tab.key as typeof filterTab)}
                          className={clsx(
                            'inline-flex min-h-[40px] min-w-0 items-center justify-center gap-1 rounded-[15px] px-2 py-1.5 text-center text-[10px] font-normal leading-none transition-all',
                            filterTab === tab.key
                              ? 'bg-white text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-[#dfe5ff]'
                              : 'text-[#5d7190] hover:bg-white/80 hover:text-slate-900',
                          )}
                        >
                          <span className="min-w-0 whitespace-nowrap">{tab.label}</span>
                          <span
                            className={clsx(
                              'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-medium leading-none',
                              filterTab === tab.key ? 'bg-[#eef2ff] text-slate-900' : 'bg-white text-[#5d7190]',
                            )}
                          >
                            {tab.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredReminders.length > reminderPageSize && (
                    <div className="overflow-hidden rounded-[20px] border border-[#e7ebff] bg-[#fbfcff] xl:flex-shrink-0">
                      <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredReminders.length}
                        pageSize={reminderPageSize}
                        onPageChange={setCurrentPage}
                        className="border-t-0 bg-transparent px-2.5 py-2 sm:px-2.5 sm:py-2 xl:flex-row xl:items-center xl:justify-end xl:gap-2 xl:[&>p]:hidden xl:[&>div]:flex-nowrap xl:[&>div]:gap-1 xl:[&>div>button]:h-8 xl:[&>div>button]:rounded-xl xl:[&>div>button]:px-2 xl:[&>div>button]:text-[11px] xl:[&>div>div>button]:h-8 xl:[&>div>div>button]:min-w-[1.9rem] xl:[&>div>div>button]:rounded-xl xl:[&>div>div>button]:px-2 xl:[&>div>div>button]:text-[11px]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="rounded-[24px] border border-[#e7ebff] bg-white py-20 text-center text-sm font-medium text-slate-400">
                  Загрузка...
                </div>
              ) : (
                <div className="space-y-5">
                  {sections.map((section) => (
                    <div key={section.key} className="space-y-3">
                      {section.items.length > 0 && (
                        <div className="flex items-center gap-2 px-1">
                          <span className={clsx('text-xs font-medium uppercase tracking-[0.16em]', section.accent)}>
                            {section.title}
                          </span>
                        </div>
                      )}

                      <AnimatePresence>
                        {section.items.map((reminder) => {
                          const typeMeta = getTypeMeta(reminder.type);
                          const bucket = getReminderBucket(reminder, now);
                          const priorityMeta = PRIORITY_META[bucket];

                          return (
                            <motion.button
                              key={reminder.id}
                              type="button"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              onClick={() => openReminderModal(reminder)}
                              className={clsx(
                                'group w-full rounded-[22px] border bg-white p-5 text-left shadow-[0_10px_35px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)]',
                                bucket === 'overdue' && 'border-rose-200',
                                bucket !== 'overdue' && 'border-[#e7ebff]',
                                bucket === 'completed' && 'opacity-75',
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 items-start gap-4">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (!reminder.isCompleted) handleComplete(reminder.id);
                                    }}
                                    className={clsx(
                                      'mt-0.5 rounded-xl border p-2 transition-all',
                                      reminder.isCompleted
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-500'
                                        : 'border-[#e4e8fb] bg-white text-slate-300 hover:border-violet-200 hover:text-violet-500',
                                    )}
                                  >
                                    {reminder.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                  </button>

                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <h3
                                        className={clsx(
                                          'text-[22px] font-semibold leading-tight text-slate-900',
                                          reminder.isCompleted && 'line-through text-slate-400',
                                        )}
                                      >
                                        {reminder.title}
                                      </h3>
                                      <span className={clsx('rounded-full border px-2.5 py-1 text-[11px] font-semibold', priorityMeta.tone)}>
                                        {priorityMeta.label}
                                      </span>
                                    </div>

                                    {reminder.description && (
                                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                                        {reminder.description}
                                      </p>
                                    )}

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">
                                        <Clock3 size={11} />
                                        {formatDueLabel(reminder.dueDate, bucket)}
                                      </span>
                                      <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium', typeMeta.tone)}>
                                        <span className={clsx('h-1.5 w-1.5 rounded-full', typeMeta.dot)} />
                                        {typeMeta.label}
                                      </span>
                                      {reminder.user?.username && (
                                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                          {reminder.user.username}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="rounded-xl bg-slate-50 p-2 text-slate-400 transition-all group-hover:bg-slate-100 group-hover:text-slate-600">
                                    <Pencil size={16} />
                                  </div>
                                  {canDeleteReminder && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleDelete(reminder.id);
                                      }}
                                      className="rounded-xl p-2 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-600"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  ))}

                  {filteredReminders.length === 0 && (
                    <div className="rounded-[24px] border border-[#e7ebff] bg-white py-20 text-center">
                      <Bell size={42} className="mx-auto mb-4 text-slate-200" />
                      <h3 className="text-xl font-semibold text-slate-900">Нет задач</h3>
                      <p className="mt-1 text-sm text-slate-500">Попробуйте сменить фильтр или создайте новое напоминание.</p>
                    </div>
                  )}

                </div>
              )}
            </div>

            <div className="flex h-full flex-col gap-5">
              <div className="rounded-[24px] border border-[#e7ebff] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
                <div className="mb-4 flex items-center justify-between">
                <h3 className="break-words text-[clamp(1.2rem,1.8vw,1.45rem)] font-medium leading-tight tracking-[-0.02em] text-slate-900">
                  {activeMonthLabel.charAt(0).toUpperCase() + activeMonthLabel.slice(1)}
                </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1))}
                      className="rounded-xl border border-[#e6e9f9] p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700"
                    >
                      <span className="block text-base leading-none">‹</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1))}
                      className="rounded-xl border border-[#e6e9f9] p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700"
                    >
                      <span className="block text-base leading-none">›</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-medium text-slate-400">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-7 gap-2">
                  {monthDays.map((day) => {
                    const isCurrentMonth = day.getMonth() === activeMonth.getMonth();
                    const isToday = sameDay(day, now);
                    const hasReminders = reminders.some((reminder) => sameDay(parseReminderDate(reminder.dueDate), day));

                    return (
                      <div
                        key={day.toISOString()}
                        className={clsx(
                          'flex h-9 items-center justify-center rounded-xl text-sm transition-all',
                          isCurrentMonth ? 'text-slate-700' : 'text-slate-300',
                          isToday && 'bg-[#7c4dff] font-semibold text-white shadow-sm',
                          !isToday && hasReminders && 'bg-violet-50 font-semibold text-violet-600',
                        )}
                      >
                        {day.getDate()}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="overflow-hidden rounded-[24px] border border-[#e7ebff] bg-white p-4 shadow-[0_10px_35px_rgba(15,23,42,0.04)] sm:p-5">
                <h3 className="max-w-full break-words text-[clamp(0.95rem,4.8vw,1.2rem)] font-medium leading-[1.15] tracking-[-0.02em] text-slate-900 sm:text-[clamp(1.05rem,1.5vw,1.25rem)]">
                  Статистика задач
                </h3>
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-2 flex min-w-0 items-start justify-between gap-3 text-sm text-slate-500">
                      <span className="min-w-0 break-words leading-5">Выполнено за неделю</span>
                      <span className="shrink-0 font-semibold text-slate-700">
                        {stats.completed} / {reminders.length || 0}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-[#7c4dff] transition-all" style={{ width: `${stats.completionRate}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="min-w-0 rounded-2xl bg-slate-50 px-2 py-3 sm:p-4">
                      <p className="break-words text-[7px] uppercase tracking-[0.01em] leading-tight text-slate-400 sm:text-[9px]">
                        Продуктивность
                      </p>
                      <p className="mt-2 whitespace-nowrap text-[clamp(1.4rem,5.4vw,2.2rem)] font-semibold leading-none text-slate-900">
                        {stats.completionRate}%
                      </p>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-rose-50 px-2 py-3 sm:p-4">
                      <p className="break-words text-[7px] uppercase tracking-[0.01em] leading-tight text-rose-400 sm:text-[9px]">
                        Просрочено
                      </p>
                      <p className="mt-2 whitespace-nowrap text-[clamp(1.4rem,5.4vw,2.2rem)] font-semibold leading-none text-rose-500">
                        {stats.overdue}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto rounded-[24px] border border-[#e7ebff] bg-white p-4 shadow-[0_10px_35px_rgba(15,23,42,0.04)] sm:p-5">
                <h3 className="break-words text-[clamp(1.05rem,1.55vw,1.25rem)] font-medium leading-tight tracking-[-0.02em] text-slate-900">Категории</h3>
                <div className="mt-3 space-y-2.5">
                  {Object.entries(TYPE_META).map(([key, meta]) => (
                    <div key={key} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className={clsx('flex h-8 w-8 items-center justify-center rounded-xl', meta.iconTone)}>
                          <Calendar size={14} />
                        </span>
                        <span className="text-sm font-medium text-slate-700">{meta.label}</span>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {categoryCounts[key] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#7c4dff] text-white shadow-[0_18px_40px_rgba(124,77,255,0.35)] transition-all hover:bg-[#6e42ee] xl:hidden"
        >
          <Plus size={22} />
        </button>

        <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm md:items-center md:p-4"
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0, y: 24 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 24 }}
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-sm overflow-hidden rounded-t-[28px] bg-white shadow-2xl md:max-w-md md:rounded-[28px]"
              >
                <div className="border-b border-slate-100 bg-violet-50/60 p-5 md:p-7">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                      <Bell size={20} className="text-violet-600" />
                      <span>{selectedReminder ? 'Напоминание' : 'Новая задача'}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-full p-2 text-slate-400 transition-all hover:bg-white hover:text-slate-700"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 p-5 md:p-7">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Заголовок</label>
                    <input
                      type="text"
                      required
                      value={reminderForm.title}
                      onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-violet-300 focus:ring-4 focus:ring-violet-500/10"
                      placeholder="Например: Позвонить клиенту"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Описание</label>
                    <textarea
                      value={reminderForm.description}
                      onChange={(e) => setReminderForm({ ...reminderForm, description: e.target.value })}
                      className="h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-violet-300 focus:ring-4 focus:ring-violet-500/10"
                      placeholder="Дополнительные детали..."
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Дата</label>
                      <input
                        type="date"
                        required
                        value={reminderForm.dueDate}
                        onChange={(e) => setReminderForm({ ...reminderForm, dueDate: e.target.value })}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-violet-300 focus:ring-4 focus:ring-violet-500/10"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Категория</label>
                      <select
                        value={reminderForm.type}
                        onChange={(e) => setReminderForm({ ...reminderForm, type: e.target.value })}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-violet-300 focus:ring-4 focus:ring-violet-500/10"
                      >
                        <option value="general">Общее</option>
                        <option value="call">Звонки клиентам</option>
                        <option value="supplier">Заказы поставщикам</option>
                        <option value="stock">Склад и учет</option>
                        <option value="finance">Финансы</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3 pt-2">
                    {selectedReminder && !selectedReminder.isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleComplete(selectedReminder.id)}
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-100"
                      >
                        Выполнить
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-2xl px-5 py-3 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="rounded-2xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700"
                    >
                      {selectedReminder ? 'Сохранить' : 'Создать'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
