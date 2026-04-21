import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet, useLocation, NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { 
  Loader2, Menu, Minus, Square, Warehouse, X, 
  LayoutDashboard, ShoppingCart, BookOpen, Package, 
  History, Users, Calendar, Banknote, LineChart, 
  BarChart3, Settings, UserCircle
} from 'lucide-react';
import LoginView from './views/LoginView';
import { getCurrentUser, isAdminUser } from './utils/userAccess';
import { clearAuthSession, getStoredUser, hasStoredSession, setAuthSession, getAuthToken } from './utils/authStorage';
import { getSessionUser } from './api/auth.api';

const DashboardView = React.lazy(() => import('./views/DashboardView'));
const ProductsView = React.lazy(() => import('./views/ProductsView'));
const SalesView = React.lazy(() => import('./views/SalesView'));
const CustomerView = React.lazy(() => import('./views/CustomerView'));
const CustomerDebtsView = React.lazy(() => import('./views/CustomerDebtsView'));
const SettingsView = React.lazy(() => import('./views/SettingsView'));
const CatalogView = React.lazy(() => import('./views/CatalogView'));
const ReportsView = React.lazy(() => import('./views/ReportsView'));
const AnalyticsView = React.lazy(() => import('./views/AnalyticsView'));
const ExpensesView = React.lazy(() => import('./views/ExpensesView'));
const RemindersView = React.lazy(() => import('./views/RemindersView'));
const HistoryView = React.lazy(() => import('./views/HistoryView'));
const POSView = React.lazy(() => import('./views/POSView'));

const TitleBar = () => {
  const windowControls = (window as any).electron?.windowControls;
  
  return (
    <div 
      style={{ WebkitAppRegion: 'drag' } as any}
      className="fixed left-0 right-0 top-0 z-[10000] flex h-10 w-full items-center justify-between bg-[linear-gradient(180deg,#ffdb4d_0%,#ffcc33_100%)] px-4 shadow-sm border-b border-black/5"
    >
      <div className="flex items-center gap-3 select-none">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/20 shadow-inner">
          <Warehouse size={16} className="text-slate-900" />
        </div>
        <span className="text-[13px] font-black text-slate-900 uppercase tracking-tight">IT FORCE | BUSINESS CRM</span>
      </div>
      
      <div 
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className="flex h-full items-stretch"
      >
        <button
          onClick={() => windowControls?.minimize?.()}
          className="flex w-12 items-center justify-center text-slate-900 hover:bg-black/10 transition-colors"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => windowControls?.toggleMaximize?.()}
          className="flex w-12 items-center justify-center text-slate-900 hover:bg-black/10 transition-colors"
        >
          <Square size={14} />
        </button>
        <button
          onClick={() => windowControls?.close?.()}
          className="flex w-12 items-center justify-center text-slate-900 hover:bg-red-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};

const NavigationBar = () => {
  const user = getCurrentUser();
  const isAdmin = isAdminUser(user);

  const items = [
    { to: '/', icon: LayoutDashboard, label: 'ГЛАВНОЕ', admin: true },
    { to: '/pos', icon: ShoppingCart, label: 'ПРОДАЖИ (POS)', admin: false },
    { to: '/products', icon: Package, label: 'ТОВАРЫ', admin: false },
    { to: '/catalog', icon: BookOpen, label: 'КАТАЛОГ', admin: false },
    { to: '/customers', icon: Users, label: 'КЛИЕНТЫ', admin: false },
    { to: '/expenses', icon: Banknote, label: 'ФИНАНСЫ', admin: true },
    { to: '/analytics', icon: LineChart, label: 'АНАЛИТИКА', admin: true },
    { to: '/settings', icon: Settings, label: 'НАСТРОЙКИ', admin: true },
  ].filter(item => !item.admin || isAdmin);

  return (
    <div className="fixed left-0 right-0 top-10 z-[9999] flex h-11 w-full items-center bg-[#f8fafc] border-b border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
      <div className="flex h-full px-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `
              relative flex h-full items-center gap-2.5 px-5 text-[11px] font-extrabold transition-all border-r border-slate-100 whitespace-nowrap
              ${isActive 
                ? 'bg-white text-[#d35400] shadow-[inset_0_-2px_0_#ff9900]' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
            `}
          >
            {({ isActive }) => (
              <>
                <item.icon size={16} className={isActive ? 'text-[#ff9900]' : 'text-slate-400'} />
                <span className="tracking-wide">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      
      <div className="ml-auto flex h-full items-center gap-3 border-l border-slate-100 bg-white/50 px-5">
         <UserCircle size={18} className="text-slate-400" />
         <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{user.username}</span>
         <div className="h-5 w-[1px] bg-slate-200"></div>
         <span className="text-[10px] font-bold text-[#ff9900] uppercase">Admin</span>
      </div>
    </div>
  );
};

const Layout = () => {
  const location = useLocation();
  
  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-white">
      <TitleBar />
      <NavigationBar />
      
      <main className="flex-1 w-full overflow-hidden pt-[84px] bg-[#f2f4f7]">
        <div className="h-full w-full overflow-auto custom-scrollbar">
          <React.Suspense fallback={
             <div className="flex h-full items-center justify-center">
                <Loader2 size={32} className="animate-spin text-[#ffcc33]" />
             </div>
          }>
            <motion.div
               key={location.pathname}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.2, ease: "easeOut" }}
               className="min-h-full w-full p-6 lg:p-8"
            >
               <div className="mx-auto max-w-[1600px]">
                  <Outlet />
               </div>
            </motion.div>
          </React.Suspense>
        </div>
      </main>

      <footer className="h-7 w-full flex items-center justify-between bg-slate-100 px-4 border-t border-slate-200 text-[10px] font-bold text-slate-500 uppercase select-none">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-green-600">
               <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
               <span>Соединение установлено</span>
            </div>
            <span className="opacity-30">|</span>
            <span>База данных: SQLITE V3</span>
         </div>
         <div className="flex items-center gap-4">
            <span>WHOLESALE ENGINE V2.1.0</span>
            <span className="opacity-30">|</span>
            <span className="text-orange-600">Enterprise License</span>
         </div>
      </footer>
    </div>
  );
};

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  return hasStoredSession() ? <>{children}</> : <Navigate to="/login" />;
};

export default function App() {
  const [isBootstrappingSession, setIsBootstrappingSession] = React.useState(() => Boolean(getStoredUser()));

  React.useEffect(() => {
    let isMounted = true;
    const bootstrapSession = async () => {
      if (!getStoredUser()) {
        if (isMounted) setIsBootstrappingSession(false);
        return;
      }
      try {
        const user = await getSessionUser();
        if (isMounted) setAuthSession(getAuthToken(), user);
      } catch {
        if (isMounted) clearAuthSession();
      } finally {
        if (isMounted) setIsBootstrappingSession(false);
      }
    };
    bootstrapSession();
    return () => { isMounted = false; };
  }, []);

  if (isBootstrappingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f2f4f7]">
        <Loader2 size={32} className="animate-spin text-[#ffcc33]" />
      </div>
    );
  }

  return (
    <Router>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="/" element={isAdminUser(getCurrentUser()) ? <DashboardView /> : <Navigate to="/pos" />} />
          <Route path="/products" element={<ProductsView />} />
          <Route path="/catalog" element={<CatalogView />} />
          <Route path="/sales" element={<SalesView />} />
          <Route path="/pos" element={<POSView />} />
          <Route path="/customers" element={<CustomerView />} />
          <Route path="/expenses" element={<ExpensesView />} />
          <Route path="/analytics" element={<AnalyticsView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
