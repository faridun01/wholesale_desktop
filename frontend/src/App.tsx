import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet, useLocation, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster } from 'react-hot-toast';
import { 
  Loader2, Minus, Square, Warehouse, X, 
  LayoutDashboard, ShoppingCart, BookOpen, Package, 
  Users, Banknote, LineChart, 
  Settings, UserCircle, Receipt, Scissors
} from 'lucide-react';
import LoginView from './views/LoginView';
import { getCurrentUser, isAdminUser } from './utils/userAccess';
import { clearAuthSession, getStoredUser, hasStoredSession, setAuthSession, getAuthToken } from './utils/authStorage';
import { getSessionUser } from './api/auth.api';

const DashboardView = React.lazy(() => import('./views/DashboardView'));
const ProductsView = React.lazy(() => import('./views/ProductsView'));
const SalesView = React.lazy(() => import('./views/SalesView'));
const CustomerView = React.lazy(() => import('./views/CustomerView'));
const SettingsView = React.lazy(() => import('./views/SettingsView'));
const CatalogView = React.lazy(() => import('./views/CatalogView'));
const AnalyticsView = React.lazy(() => import('./views/AnalyticsView'));
const ExpensesView = React.lazy(() => import('./views/ExpensesView'));
const POSView = React.lazy(() => import('./views/POSView'));
const WriteOffsView = React.lazy(() => import('./views/WriteOffsView'));

const TitleBar = () => {
  const windowControls = (window as any).electron?.windowControls;
  
  return (
    <div className="flex-none flex h-9 w-full items-center justify-between bg-[#ffcc00] px-4 shadow-[0_1px_4px_rgba(0,0,0,0.1)] border-b border-black/5 relative z-[1000]">
      <div className="flex items-center gap-3 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex h-6 w-6 items-center justify-center rounded bg-red-600 text-white font-normal text-[10px]">1C</div>
        <span className="text-[11px] font-normal text-slate-800 uppercase tracking-widest">1Click: СКЛАД</span>
      </div>
      
      <div className="flex-1 h-full" style={{ WebkitAppRegion: 'drag' } as any}></div>

      <div 
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className="flex h-full items-stretch relative z-[1001]"
      >
        <button onClick={() => windowControls?.minimize?.()} className="flex w-10 items-center justify-center text-slate-800 hover:bg-black/5 transition-colors focus:outline-none">
          <Minus size={14} />
        </button>
        <button onClick={() => windowControls?.toggleMaximize?.()} className="flex w-10 items-center justify-center text-slate-800 hover:bg-black/5 transition-colors focus:outline-none">
          <Square size={12} />
        </button>
        <button onClick={() => windowControls?.close?.()} className="flex w-12 items-center justify-center text-slate-800 hover:bg-red-600 hover:text-white transition-colors focus:outline-none">
          <X size={18} />
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
    { to: '/sales', icon: Receipt, label: 'ЖУРНАЛ ПРОДАЖ', admin: false },
    { to: '/products', icon: Package, label: 'ТОВАРЫ И СКЛАД', admin: false },
    { to: '/write-offs', icon: Scissors, label: 'СПИСАНИЯ', admin: false },
    { to: '/catalog', icon: BookOpen, label: 'РЕФЕРЕНСЫ', admin: false },
    { to: '/customers', icon: Users, label: 'КОНТРАГЕНТЫ', admin: false },
    { to: '/expenses', icon: Banknote, label: 'ФИНАНСЫ', admin: true },
    { to: '/analytics', icon: LineChart, label: 'АНАЛИТИКА', admin: true },
    { to: '/settings', icon: Settings, label: 'НАСТРОЙКИ', admin: true },
  ].filter(item => !item.admin || isAdmin);

  return (
    <div className="flex-none flex h-10 w-full items-center bg-[#f8f9fb] border-b border-border-base shadow-sm">
      <div className="flex h-full overflow-x-auto no-scrollbar">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `
              relative flex h-full items-center gap-2 px-6 text-[10px] font-normal transition-all border-r border-border-base whitespace-nowrap uppercase tracking-widest
              ${isActive 
                ? 'bg-white text-red-600 shadow-[inset_0_-3px_0_#ff0000]' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}
            `}
          >
            <item.icon size={14} className="stroke-[2.5]" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      
      <div className="ml-auto flex h-full items-center gap-3 bg-white px-5 border-l border-border-base">
         <div className="flex flex-col items-end">
            <span className="text-[10px] font-normal text-slate-800 uppercase tracking-tighter">{user.username}</span>
            <span className="text-[8px] font-normal text-red-600 uppercase leading-none tracking-widest">{isAdmin ? 'Администратор' : 'Оператор'}</span>
         </div>
         <UserCircle size={20} className="text-slate-300" />
      </div>
    </div>
  );
};

const Layout = () => {
  const location = useLocation();
  
  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-bg-base">
      <TitleBar />
      <NavigationBar />
      
      <main className="flex-1 w-full overflow-hidden relative z-0">
         <Suspense fallback={
            <div className="flex h-full items-center justify-center bg-white/50 backdrop-blur-sm">
               <Loader2 size={32} className="animate-spin text-brand-orange" />
            </div>
         }>
           <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="h-full w-full overflow-auto custom-scrollbar p-6"
           >
              <Outlet />
           </motion.div>
         </Suspense>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-50 h-6 w-full flex items-center justify-between bg-[#f8f9fb] px-4 border-t border-border-base text-[9px] font-normal text-slate-400 uppercase tracking-widest select-none">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-emerald-600">
               <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <span>1C: СИСТЕМА ГОТОВА</span>
            </div>
            <span>БАЗА: 1CLICK_ENTERPRISE_DB</span>
         </div>
         <div className="flex items-center gap-4 italic font-medium">
            <span>1CLICK WHOLESALE ENGINE v4.1 (TAXI STYLE)</span>
            <span className="text-red-600 border border-red-600/20 px-1.5 rounded-[2px] not-italic">LOCKED</span>
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
        if (isMounted) {
           setAuthSession(getAuthToken(), user);
        }
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
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <Loader2 size={32} className="animate-spin text-brand-orange" />
      </div>
    );
  }

  return (
    <Router>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="/" element={<DashboardView />} />
          <Route path="/products" element={<ProductsView />} />
          <Route path="/write-offs" element={<WriteOffsView />} />
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
