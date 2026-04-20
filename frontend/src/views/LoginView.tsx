import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionUser, login, loginWithTwoFactor, getSetupStatus, performSetup } from '../api/auth.api';
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Lock, User, Warehouse, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

      // 1. SAVE TOKEN FIRST
      setAuthSession(result.token, result.user);

      // 2. NOW GET SESSION USER (will include token in header)
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

  const resetTwoFactorStep = () => {
    setTwoFactorToken('');
    setTwoFactorCode('');
    setTwoFactorUsername('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl lg:grid-cols-2"
      >
        <section className="hidden flex-col justify-center bg-slate-900 p-10 text-white lg:flex">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-700">
              <Warehouse size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Wholesale CRM</h1>
              <p className="text-sm text-slate-300">Рабочая зона администратора</p>
            </div>
          </div>

          <h2 className="mb-4 text-3xl font-semibold leading-tight">
            {isSetupMode ? 'Начальная конфигурация системы' : 'Безопасный доступ к складу'}
          </h2>

          <p className="text-sm leading-7 text-slate-300">
            {isSetupMode 
              ? 'Это ваш первый запуск. Пожалуйста, создайте учетную запись главного администратора. Эти данные будут использоваться для управления всей системой.' 
              : 'Войдите в систему под своей учётной записью для работы со складом, продажами и отчетами.'}
          </p>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:text-left">
              <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl lg:mx-0 ${isSetupMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                {isSetupMode ? <ShieldAlert size={26} /> : <Warehouse size={26} />}
              </div>
              <h2 className="text-3xl font-semibold text-slate-900">
                {isSetupMode ? 'Первый вход' : (twoFactorToken ? 'Защита 2FA' : 'Вход в систему')}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {isSetupMode 
                  ? 'Придумайте логин и надежный пароль для администратора.' 
                  : (twoFactorToken ? 'Введите код подтверждения.' : 'Введите ваши данные для входа.')}
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <AnimatePresence mode="wait">
              {isSetupMode ? (
                <motion.form
                  key="setup"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleSetup} 
                  className="space-y-5"
                >
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                    <strong>Внимание:</strong> Вы создаете первую учетную запись. Она получит полные права Администратора.
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">Логин администратора</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Например: admin"
                        className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">Надежный пароль</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Например: Admin!2024"
                        className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-70"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : <span>Создать и войти</span>}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsSetupMode(false)}
                    className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
                  >
                    Вернуться к обычному входу
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  {!twoFactorToken ? (
                    <form onSubmit={handleLogin} className="space-y-5">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-600">Логин</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ваш логин"
                            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-600">Пароль</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Ваш пароль"
                            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
                      >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <><span>Войти</span><ArrowRight size={16} /></>}
                      </button>
                      {!isConfigured && (
                        <button 
                          type="button" 
                          onClick={() => setIsSetupMode(true)}
                          className="w-full rounded-xl border border-amber-200 bg-amber-50 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                        >
                          Первый запуск? Создать администратора
                        </button>
                      )}
                    </form>
                  ) : (
                    <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
                      <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                        Подтвердите вход для <b>{twoFactorUsername}</b>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-600">Код 2FA</label>
                        <div className="relative">
                          <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            type="text"
                            required
                            value={twoFactorCode}
                            onChange={(e) => setTwoFactorCode(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={resetTwoFactorStep} type="button" className="rounded-xl border border-slate-200 px-4 py-3 text-sm"><ArrowLeft size={16}/></button>
                        <button type="submit" disabled={isLoading} className="flex-1 rounded-xl bg-slate-900 text-white font-medium">Проверить</button>
                      </div>
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
