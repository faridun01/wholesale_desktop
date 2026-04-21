import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionUser, login, loginWithTwoFactor, getSetupStatus, performSetup } from '../api/auth.api';
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Lock, User, Warehouse } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { setAuthSession } from '../utils/authStorage';

export default function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [twoFactorUsername, setTwoFactorUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isConfigured, setIsConfigured] = useState(true);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    try {
      const status = await getSetupStatus();
      setIsConfigured(status.isConfigured);
      if (!status.isConfigured) {
        setIsSetupMode(true);
      }
    } catch (err) {
      console.error('Failed to check setup status', err);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await login({ username, password });
      if (result.requiresTwoFactor) {
        setTwoFactorToken(result.twoFactorToken);
        setTwoFactorUsername(result.user?.username || username);
        setTwoFactorCode('');
        return;
      }

      setAuthSession(result.token, result.user);
      const sessionUser = await getSessionUser();
      setAuthSession(result.token, sessionUser || result.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Ошибка входа');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await performSetup({ username, password });
      setAuthSession(result.token, result.user);
      const sessionUser = await getSessionUser();
      setAuthSession(result.token, sessionUser || result.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Ошибка настройки');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await loginWithTwoFactor({
        twoFactorToken,
        code: twoFactorCode,
      });
      const sessionUser = await getSessionUser();
      setAuthSession(result.token, sessionUser || result.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Ошибка проверки 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-5xl overflow-hidden rounded-[32px] bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] grid lg:grid-cols-2"
      >
        <section className="hidden lg:flex flex-col justify-center bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] p-16 text-white relative overflow-hidden">
           {/* Decorative elements */}
           <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
           <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-400/20 rounded-full -ml-32 -mb-32 blur-3xl"></div>
           
          <div className="relative z-10">
            <div className="mb-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xl">
              <Warehouse size={32} className="text-blue-600" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-4">IT FORCE</h1>
            <p className="text-blue-100 text-lg leading-relaxed max-w-md">
               Современная платформа для управления оптовым бизнесом. Просто. Эффективно. Надежно.
            </p>
          </div>
        </section>

        <section className="p-10 sm:p-16 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto">
            <header className="mb-10">
               <h2 className="text-3xl font-bold text-slate-900 mb-3">
                  {isSetupMode ? 'Добро пожаловать' : (twoFactorToken ? 'Защита аккаунта' : 'С возвращением')}
               </h2>
               <p className="text-slate-500">
                  {isSetupMode ? 'Создайте свой первый аккаунт администратора.' : (twoFactorToken ? 'Введите код подтверждения.' : 'Войдите в свою учетную запись.')}
               </p>
            </header>

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-8 rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 font-semibold"
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={isSetupMode ? handleSetup : (twoFactorToken ? handleTwoFactorSubmit : handleLogin)} className="space-y-6">
              {!twoFactorToken ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Логин</label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3.5 pl-12 pr-4 text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                        placeholder="Введите имя пользователя"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Пароль</label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3.5 pl-12 pr-4 text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Код 2FA</label>
                  <div className="relative group">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3.5 pl-12 pr-4 text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                      placeholder="000 000"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:shadow-blue-500/30 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isLoading ? <Loader2 className="animate-spin" size={24} /> : (isSetupMode ? 'Завершить настройку' : 'Войти в аккаунт')}
                {!isLoading && <ArrowRight size={20} />}
              </button>
            </form>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
