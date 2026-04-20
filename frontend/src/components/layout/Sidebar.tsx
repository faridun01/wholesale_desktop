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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import client from '../../api/client';
import { logout } from '../../api/auth.api';
import { clearAuthSession, hasStoredSession } from '../../utils/authStorage';
import { getCurrentUser, isAdminUser } from '../../utils/userAccess';

type NavSection = 'Управление' | 'Отношения' | 'Система';

type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  section: NavSection;
};

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Дашборд', section: 'Управление' },
  { to: '/pos', icon: ShoppingCart, label: 'POS терминал', section: 'Управление' },
  { to: '/catalog', icon: BookOpen, label: 'Каталог', section: 'Управление' },
  { to: '/products', icon: Package, label: 'Товары', section: 'Управление' },
  { to: '/sales', icon: History, label: 'История продаж', section: 'Управление' },
  { to: '/customers', icon: Users, label: 'Клиенты', section: 'Отношения' },
  { to: '/reminders', icon: Calendar, label: 'Напоминания', section: 'Отношения' },
  { to: '/expenses', icon: Banknote, label: 'Расходы', section: 'Система' },
  { to: '/analytics', icon: LineChart, label: 'Аналитика', section: 'Система' },
  { to: '/reports', icon: BarChart3, label: 'Отчеты', section: 'Система' },
  { to: '/settings', icon: Settings, label: 'Настройки', section: 'Система' },
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

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncViewport);
      return () => mediaQuery.removeEventListener('change', syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    if (!hasStoredSession()) return;

    const refreshRemindersCount = () => {
      client
        .get('/reminders')
        .then((res) => {
          const items = Array.isArray(res.data) ? res.data : [];
          setRemindersCount(items.filter((item: any) => !item.isCompleted).length);
        })
        .catch(() => {
          setRemindersCount(0);
        });
    };

    refreshRemindersCount();
    window.addEventListener('focus', refreshRemindersCount);
    window.addEventListener('reminders-updated', refreshRemindersCount as EventListener);

    return () => {
      window.removeEventListener('focus', refreshRemindersCount);
      window.removeEventListener('reminders-updated', refreshRemindersCount as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || isDesktopViewport) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isOpen ? 'hidden' : previousOverflow;

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDesktopViewport, isOpen]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // If server session is already gone, clear local session anyway.
    }

    clearAuthSession();
    navigate('/login');
  };

  const filteredNavItems = navItems
    .filter((item) => {
      if (
        !isAdmin &&
        (item.to === '/' ||
          item.to === '/expenses' ||
          item.to === '/analytics' ||
          item.to === '/reports' ||
          item.to === '/settings')
      ) {
        return false;
      }
      if (
        item.to === '/expenses' ||
        item.to === '/analytics' ||
        item.to === '/reports' ||
        item.to === '/settings'
      ) {
        return isAdmin;
      }
      return true;
    })
    .map((item) => {
      if (!isAdmin && item.to === '/sales') {
        return {
          ...item,
          label: 'Мои накладные',
        };
      }

      return item;
    });

  const navSections = filteredNavItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.section]) {
      acc[item.section] = [];
    }
    acc[item.section].push(item);
    return acc;
  }, {});

  const sidebarCollapsed = isDesktopViewport && isCollapsed;

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-[#08111d]/40 backdrop-blur-[3px] transition-opacity duration-300 lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-[100dvh] flex-col overflow-y-auto overflow-x-hidden border-r border-white/10 bg-[linear-gradient(180deg,#101a28_0%,#0d1521_100%)] text-[#eaf1f8] shadow-[0_28px_60px_rgba(2,8,23,0.38)] transition-[width,transform] duration-300 ease-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:border-l-0 lg:border-b-0 lg:border-[#202c3c] lg:bg-[#111927] lg:shadow-none',
          sidebarCollapsed
            ? 'w-[84px] rounded-r-[28px] lg:w-[84px] lg:max-w-none lg:rounded-none'
            : 'w-[min(86vw,340px)] rounded-r-[28px] lg:w-[248px] lg:max-w-none lg:rounded-none',
          isOpen ? 'translate-x-0' : '-translate-x-[110%]',
        )}
      >
        <div
          className={clsx(
            'border-b border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0)_100%)] backdrop-blur-sm',
            sidebarCollapsed ? 'px-2.5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]' : 'px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]',
          )}
        >
          <div className={clsx('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  onToggleCollapse();
                  return;
                }

                navigate('/');
                onClose();
              }}
              title={sidebarCollapsed ? 'Развернуть меню' : 'Оптовая торговля'}
              className={clsx(
                'flex shrink-0 items-center justify-center transition-all duration-200',
                sidebarCollapsed
                  ? 'h-[46px] w-[46px] rounded-[16px] bg-[linear-gradient(180deg,#0f9f6e_0%,#0b7d59_100%)] text-white shadow-[0_12px_28px_rgba(15,159,110,0.28)]'
                  : 'h-11 w-11 rounded-[16px] bg-[linear-gradient(180deg,#0f9f6e_0%,#0b7d59_100%)] text-white shadow-[0_12px_24px_rgba(15,159,110,0.26)]',
              )}
            >
              <Warehouse size={sidebarCollapsed ? 21 : 19} />
            </button>

            {!sidebarCollapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold leading-[1.1] tracking-tight text-white">
                    Оптовая торговля
                  </div>
                  <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#7ca297]">
                    Навигация
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="ml-auto hidden h-9 w-9 items-center justify-center rounded-xl bg-[#1a2535] text-[#c6d3e3] transition-colors hover:bg-[#223247] hover:text-white lg:flex"
                  title="Свернуть меню"
                >
                  <ChevronLeft size={17} />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="ml-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#d7e2ef] transition-colors hover:bg-white/10 hover:text-white lg:hidden"
              title="Закрыть меню"
            >
              <ChevronLeft size={17} />
            </button>
          </div>
        </div>

        <nav className={clsx('flex-1 overflow-visible', sidebarCollapsed ? 'px-2 py-2' : 'px-3 py-3')}>
          <div className="space-y-3">
            {Object.entries(navSections).map(([section, items]) => (
              <div key={section}>
                {!sidebarCollapsed && (
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a8ea7]">
                    {section}
                  </p>
                )}

                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/customers'}
                      onClick={() => {
                        if (window.innerWidth < 1024) onClose();
                      }}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        clsx(
                          'group relative flex border transition-all duration-200',
                          sidebarCollapsed
                            ? 'mx-auto h-[46px] w-[46px] items-center justify-center rounded-[16px]'
                            : 'items-center gap-3 rounded-[18px] px-3.5 py-3',
                          isActive
                            ? 'border-[#285449] bg-[linear-gradient(180deg,rgba(22,163,74,0.18)_0%,rgba(13,27,34,0.95)_100%)] text-white shadow-[0_12px_26px_rgba(9,15,28,0.26)]'
                            : 'border-transparent bg-transparent text-[#a5b4c7] hover:border-white/10 hover:bg-white/[0.045] hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon
                            size={sidebarCollapsed ? 22 : 18}
                            className="shrink-0"
                            strokeWidth={isActive ? 2.2 : 2}
                          />

                          {!sidebarCollapsed && <span className="truncate text-[14px] font-medium">{item.label}</span>}

                          {item.to === '/reminders' && remindersCount > 0 && (
                            <span
                              className={clsx(
                                'flex items-center justify-center rounded-full bg-[#ef4444] text-[9px] font-semibold text-white',
                                sidebarCollapsed ? 'absolute right-1.5 top-1.5 h-4 min-w-4 px-1' : 'ml-auto h-4 min-w-4 px-1',
                              )}
                            >
                              {remindersCount > 9 ? '9+' : remindersCount}
                            </span>
                          )}

                          {sidebarCollapsed && isActive && (
                            <span className="absolute inset-0 rounded-[16px] bg-[linear-gradient(180deg,rgba(15,159,110,0.22)_0%,rgba(11,125,89,0.2)_100%)]" />
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className={clsx('mt-auto border-t border-white/5', sidebarCollapsed ? 'px-2 py-2' : 'px-3 py-2.5')}>
          <div
            className={clsx(
              'rounded-[18px] border border-[#223043] bg-[#172133]',
              sidebarCollapsed ? 'px-0 py-2' : 'p-2.5',
            )}
          >
            <div className={clsx('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
              <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[14px] bg-[#223148] text-sm font-semibold text-white">
                {user.username?.[0]?.toUpperCase()}
              </div>

              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#eaf1f8]">{user.username}</p>
                  <p className="truncate text-[9px] uppercase tracking-[0.12em] text-[#73869d]">{user.role}</p>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <button
                onClick={handleLogout}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-transparent bg-[#223148] py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#c9d5e3] transition-colors hover:border-[#5a3441] hover:bg-[#3a2430] hover:text-[#fecdd3]"
                title="Выйти"
              >
                <LogOut size={13} />
                <span>Выйти</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
