import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone, X } from 'lucide-react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import {
  disableUserTwoFactor,
  setupUserTwoFactor,
  verifyUserTwoFactorSetup,
} from '../../api/auth.api';

type ManagedUser = {
  id: number;
  username: string;
  role?: string;
  twoFactorEnabled?: boolean;
};

type Props = {
  isOpen: boolean;
  user: ManagedUser | null;
  onClose: () => void;
  onUpdated: () => void;
};

export default function UserTwoFactorModal({ isOpen, user, onClose, onUpdated }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [setupData, setSetupData] = useState<null | {
    secret: string;
    otpauthUrl: string;
    backupCodes: string[];
    setupToken: string;
  }>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSetupData(null);
      setVerificationCode('');
      setQrCodeDataUrl('');
    }
  }, [isOpen]);

  useEffect(() => {
    let isMounted = true;

    const renderQr = async () => {
      if (!setupData?.otpauthUrl) {
        setQrCodeDataUrl('');
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(setupData.otpauthUrl, {
          width: 260,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });

        if (isMounted) {
          setQrCodeDataUrl(dataUrl);
        }
      } catch {
        if (isMounted) {
          setQrCodeDataUrl('');
        }
      }
    };

    renderQr();
    return () => {
      isMounted = false;
    };
  }, [setupData?.otpauthUrl]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) {
    return null;
  }

  const handleStartSetup = async () => {
    try {
      setIsLoading(true);
      const data = await setupUserTwoFactor(user.id);
      setSetupData(data);
      setVerificationCode('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось подготовить 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!setupData) return;

    try {
      setIsLoading(true);
      await verifyUserTwoFactorSetup(user.id, {
        setupToken: setupData.setupToken,
        code: verificationCode,
      });
      toast.success(`2FA включена для ${user.username}`);
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Код подтверждения неверный');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    try {
      setIsLoading(true);
      await disableUserTwoFactor(user.id);
      toast.success(`2FA отключена для ${user.username}`);
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Не удалось отключить 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (!setupData?.secret) return;

    try {
      await navigator.clipboard.writeText(setupData.secret.replace(/\s+/g, ''));
      toast.success('Секретный ключ скопирован');
    } catch {
      toast.error('Не удалось скопировать ключ');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/55 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[2.5rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-500 p-3 text-white shadow-lg shadow-violet-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 sm:text-xl">Двухфакторная защита</h3>
              <p className="text-sm font-medium text-slate-500">
                {user.username} {user.role ? `• ${user.role}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Статус</p>
                <p className="mt-2 text-lg font-black text-slate-900">
                  {user.twoFactorEnabled ? 'Включена' : 'Выключена'}
                </p>
              </div>
              <span
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${
                  user.twoFactorEnabled
                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                    : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                {user.twoFactorEnabled ? 'Активна' : 'Не настроена'}
              </span>
            </div>
          </div>

          {!user.twoFactorEnabled && !setupData ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-white p-2.5 text-violet-600">
                    <Smartphone size={18} />
                  </div>
                  <p className="text-sm font-semibold leading-7 text-slate-700">
                    Нажмите кнопку ниже, чтобы сгенерировать QR-код, секретный ключ и резервные коды для сотрудника.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartSetup}
                disabled={isLoading}
                className="rounded-2xl bg-violet-500 px-6 py-4 font-black text-white shadow-xl shadow-violet-500/20 transition-all hover:bg-violet-600 disabled:opacity-70"
              >
                Подготовить 2FA
              </button>
            </div>
          ) : null}

          {!user.twoFactorEnabled && setupData ? (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Шаг 1</p>
                <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
                  Откройте приложение-аутентификатор и отсканируйте QR-код или добавьте ключ вручную.
                </p>
                {qrCodeDataUrl ? (
                  <div className="mt-4 flex justify-center">
                    <div className="rounded-3xl bg-white p-4 shadow-sm">
                      <img src={qrCodeDataUrl} alt="QR code for 2FA" className="h-56 w-56 rounded-2xl" />
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 rounded-2xl bg-white px-4 py-4 font-mono text-base font-bold tracking-[0.18em] text-slate-900">
                  {setupData.secret}
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 transition-all hover:bg-violet-50"
                  >
                    Копировать ключ
                  </button>
                  <a
                    href={setupData.otpauthUrl}
                    className="rounded-2xl bg-violet-600 px-5 py-3 text-center text-sm font-black text-white transition-all hover:bg-violet-700"
                  >
                    Открыть в Authenticator
                  </a>
                </div>
              </div>

              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Резервные коды</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {setupData.backupCodes.map((code) => (
                    <div key={code} className="rounded-2xl bg-white px-4 py-3 font-mono text-sm font-bold text-slate-800">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-slate-700">
                  Код подтверждения
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-5 py-4 pl-12 font-bold outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-300/40"
                    placeholder="Введите 6-значный код"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setSetupData(null)}
                  className="rounded-2xl px-6 py-4 font-black text-slate-500 transition-all hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-2xl bg-violet-500 px-8 py-4 font-black text-white shadow-xl shadow-violet-500/20 transition-all hover:bg-violet-600 disabled:opacity-70"
                >
                  Подтвердить и включить
                </button>
              </div>
            </form>
          ) : null}

          {user.twoFactorEnabled ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5">
                <p className="text-sm font-semibold leading-7 text-slate-700">
                  Если сотрудник потерял доступ к приложению-аутентификатору, админ может отключить 2FA и настроить её заново.
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={isLoading}
                  className="rounded-2xl bg-rose-600 px-6 py-4 font-black text-white shadow-xl shadow-rose-600/20 transition-all hover:bg-rose-700 disabled:opacity-70"
                >
                  Сбросить 2FA
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
