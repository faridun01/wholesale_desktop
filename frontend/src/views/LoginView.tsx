import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionUser, login, loginWithTwoFactor, getSetupStatus, performSetup } from '../api/auth.api';
import { KeyRound, Loader2, Lock, User, Warehouse, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { setAuthSession } from '../utils/authStorage';

export default function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSetupMode, setIsSetupMode] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    try {
      const status = await getSetupStatus();
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
        setTwoFactorCode('');
        return;
      }

      setAuthSession(result.token, result.user);
      navigate('/');
    } catch (err: any) {
      if (!err.response) {
        setError('Сервер не отвечает. Попробуйте перезагрузить приложение.');
      } else {
        setError(err.response?.data?.error || 'Неверные данные для входа');
      }
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
      navigate('/');
    } catch (err: any) {
      if (!err.response) {
        setError('Сервер не отвечает. Убедитесь, что приложение запущено корректно.');
      } else {
        setError(err.response?.data?.error || 'Ошибка инициализации системы');
      }
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
      setError(err.response?.data?.error || 'Ошибка проверки ключа доступа');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f3f7] flex items-center justify-center p-4 select-none">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-[400px] bg-white border border-border-base rounded-[4px] shadow-2xl overflow-hidden"
      >
        {/* 1C Style Window Header */}
        <div className="bg-brand-yellow px-4 py-2 flex items-center justify-between border-b border-black/10">
          <div className="flex items-center gap-2">
            <Warehouse size={16} className="text-slate-800" />
            <span className="text-[10px] font-normal uppercase tracking-widest text-slate-800">Аутентификация пользователя</span>
          </div>
          <X size={14} className="text-slate-500 cursor-pointer hover:text-rose-600" />
        </div>

        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-slate-50 p-4 rounded-full border border-border-base mb-4">
              <User size={32} className="text-brand-orange" />
            </div>
            <h2 className="text-sm font-normal text-slate-800 uppercase tracking-widest text-center">
              {isSetupMode ? 'Начальная настройка' : 'Вход в систему'}
            </h2>
            <p className="text-[10px] text-slate-400 font-normal uppercase mt-1">1Click Warehouse Enterprise</p>
          </div>

          <form onSubmit={isSetupMode ? handleSetup : (twoFactorToken ? handleTwoFactorSubmit : handleLogin)} className="space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-100 p-3 rounded text-[11px] font-normal text-rose-600 text-center uppercase tracking-tighter">
                {error}
              </div>
            )}

            {!twoFactorToken ? (
              <>
                <div>
                  <label className="block text-[10px] font-normal text-slate-400 uppercase mb-1 tracking-widest">Имя пользователя</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="field-1c w-full pl-10"
                      placeholder="Администратор"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-normal text-slate-400 uppercase mb-1 tracking-widest">Пароль</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="field-1c w-full pl-10"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-[10px] font-normal text-slate-400 uppercase mb-1 tracking-widest">Код безопасности (2FA)</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="field-1c w-full pl-10"
                    placeholder="000 000"
                  />
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-1c btn-1c-primary w-full py-2.5 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : (isSetupMode ? 'УСТАНОВИТЬ КОНФИГУРАЦИЮ' : 'ВОЙТИ')}
              </button>
              <button 
                type="button" 
                onClick={() => window.close()} 
                className="btn-1c w-full py-2"
              >
                ОТМЕНА
              </button>
            </div>
          </form>
        </div>

        <div className="bg-[#f8f9fb] border-t border-border-base p-3 text-center">
          <span className="text-[9px] font-normal text-slate-300 uppercase tracking-[0.2em]">1CLICK WHOLESALE ENGINE v4.1</span>
        </div>
      </motion.div>
    </div>
  );
}
