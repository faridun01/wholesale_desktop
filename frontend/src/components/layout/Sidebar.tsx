import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Banknote,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronLeft,
  History,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Warehouse,
  X,
  Menu
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import client from '../../api/client';
import { logout } from '../../api/auth.api';
import { clearAuthSession, hasStoredSession } from '../../utils/authStorage';
import { getCurrentUser, isAdminUser } from '../../utils/userAccess';

type NavSection = 'ОСНОВНОЕ' | 'КЛИЕНТЫ' | 'СИСТЕМА';

type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  section: NavSection;
};

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Дашборд', section: 'ОСНОВНОЕ' },
  { to: '/pos', icon: ShoppingCart, label: 'POS терминал', section: 'ОСНОВНОЕ' },
  { to: '/catalog', icon: BookOpen, label: 'Каталог', section: 'ОСНОВНОЕ' },
  { to: '/products', icon: Package, label: 'Товары', section: 'ОСНОВНОЕ' },
  { to: '/sales', icon: History, label: 'История продаж', section: 'ОСНОВНОЕ' },
  { to: '/customers', icon: Users, label: 'Клиенты', section: 'КЛИЕНТЫ' },
  { to: '/reminders', icon: Calendar, label: 'Напоминания', section: 'КЛИЕНТЫ' },
  { to: '/expenses', icon: Banknote, label: 'Расходы', section: 'СИСТЕМА' },
  { to: '/analytics', icon: LineChart, label: 'Аналитика', section: 'СИСТЕМА' },
  { to: '/reports', icon: BarChart3, label: 'Отчеты', section: 'СИСТЕМА' },
  { to: '/settings', icon: Settings, label: 'Настройки', section: 'СИСТЕМА' },
];

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

export default function Sidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isAdmin = isAdminUser(user);
  const [remindersCount, setRemindersCount] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const syncViewport = (event?: MediaQueryListEvent) => {
      setIsDesktopViewport(event ? event.matches : mediaQuery.matches);
    };
    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!hasStoredSession()) return;
    const refreshRemindersCount = () => {
      client.get('/reminders')
        .then((res) => {
          const items = Array.isArray(res.data) ? res.data : [];
          setRemindersCount(items.filter((item: any) => !item.isCompleted).length);
        })
        .catch(() => setRemindersCount(0));
    };
    refreshRemindersCount();
    window.addEventListener('focus', refreshRemindersCount);
    return () => window.removeEventListener('focus', refreshRemindersCount);
  }, []);

  const handleLogout = async () => {
    try { await logout(); } catch {}
    clearAuthSession();
    navigate('/login');
  };

  const filteredNavItems = navItems.filter((item) => {
    if (!isAdmin && (item.to === '/' || item.to === '/expenses' || item.to === '/analytics' || item.to === '/reports' || item.to === '/settings')) return false;
    return true;
  });

  const navSections = filteredNavItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const sidebarCollapsed = isDesktopViewport && isCollapsed;

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-black/5 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-[11000] flex h-full flex-col bg-white border-r border-slate-100 transition-[width] duration-300 lg:sticky lg:top-0 h-screen',
          sidebarCollapsed ? 'w-20' : 'w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center px-4 pt-4 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffcc00] text-red-600 shadow-lg shadow-yellow-500/20 border-2 border-red-600 font-normal text-xl">
            1C
          </div>
          {!sidebarCollapsed && (
            <div className="ml-3 flex flex-1 items-center justify-between">
              <div>
                <p className="text-sm font-normal text-slate-900 tracking-tight leading-none">1CLICK: СКЛАД</p>
                <p className="text-[10px] font-normal text-red-600 uppercase tracking-widest mt-1">Enterprise CRM</p>
              </div>
              <button
                onClick={onToggleCollapse}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-50 text-slate-400 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          )}
          {sidebarCollapsed && (
            <button
               onClick={onToggleCollapse}
               className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-100 text-slate-400 shadow-sm hover:text-blue-600 transition-colors"
            >
               <ChevronLeft size={12} className={clsx("transition-transform", isCollapsed && "rotate-180")} />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-3 custom-scrollbar">
          {Object.entries(navSections).map(([section, items]) => (
            <div key={section} className="space-y-1">
              {!sidebarCollapsed && (
                <p className="px-3 text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-2">
                  {section}
                </p>
              )}
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-xl transition-all duration-200 group',
                      sidebarCollapsed ? 'h-12 justify-center' : 'px-3 py-2.5 gap-3',
                      isActive 
                        ? 'bg-[#fff9e6] text-[#b38f00] font-semibold' 
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    )
                  }
                >
                  <item.icon size={20} className={clsx('transition-colors', sidebarCollapsed ? '' : 'group-hover:scale-110')} />
                  {!sidebarCollapsed && <span className="text-[13.5px] font-medium">{item.label}</span>}
                  {item.to === '/reminders' && remindersCount > 0 && !sidebarCollapsed && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-lg bg-red-100 text-[10px] font-normal text-red-600">
                      {remindersCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          <div className={clsx('flex items-center gap-3 p-2 rounded-2xl bg-slate-50 border border-slate-100', sidebarCollapsed ? 'justify-center' : '')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm text-sm font-normal text-red-600 border border-red-100">
               {user.username?.[0]?.toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-normal text-slate-900">{user.username}</p>
                <p className="truncate text-[10px] text-red-600/70 font-normal uppercase tracking-tighter">{user.role}</p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button onClick={handleLogout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-[10px] font-normal uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors">
              <LogOut size={14} />
              <span>Выход</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
