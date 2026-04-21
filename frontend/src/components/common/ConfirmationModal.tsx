import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  closeOnConfirmStart?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Удалить',
  cancelText = 'Отмена',
  type = 'danger',
  closeOnConfirmStart = false,
}: ConfirmationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const handleConfirm = async () => {
    if (closeOnConfirmStart) {
      setIsSubmitting(true);
      onClose();

      try {
        await Promise.resolve(onConfirm());
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    try {
      setIsSubmitting(true);
      await Promise.resolve(onConfirm());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-[2px] border-2 border-brand-orange bg-white shadow-2xl"
          >
            {/* Header 1C Style */}
            <div className="flex shrink-0 items-center justify-between border-b border-black/10 bg-brand-yellow px-4 py-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-800">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-slate-700 transition-colors hover:bg-black/5 p-0.5 rounded-sm"
              >
                <X size={18} />
              </button>
            </div>

            {/* Message Area */}
            <div className="flex flex-col items-center gap-5 p-8 text-center bg-[#fcfcfc]">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full border-4 shadow-inner ${
                  type === 'danger'
                    ? 'border-rose-100 bg-rose-50 text-rose-600'
                    : type === 'warning'
                      ? 'border-amber-100 bg-amber-50 text-amber-600'
                      : 'border-indigo-100 bg-indigo-50 text-indigo-600'
                }`}
              >
                <AlertTriangle size={32} />
              </div>
              <p className="text-[11px] font-bold leading-relaxed text-slate-600 uppercase tracking-tight">{message}</p>
            </div>

            {/* Footer 1C Style */}
            <div className="flex gap-4 border-t border-border-base bg-[#f2f3f7] p-4 px-6">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn-1c flex-1 !bg-white !text-slate-600 border-slate-200 h-10 font-black uppercase tracking-wider !rounded-[4px] shadow-sm hover:!bg-slate-50"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className={`btn-1c flex-1 h-10 font-black uppercase tracking-wider !rounded-[4px] shadow-sm !text-white active:scale-95 ${
                  type === 'danger'
                    ? '!bg-rose-600 border-rose-700 hover:!bg-rose-700'
                    : type === 'warning'
                      ? '!bg-amber-600 border-amber-700 hover:!bg-amber-700'
                      : '!bg-indigo-600 border-indigo-700 hover:!bg-indigo-700'
                }`}
              >
                {isSubmitting && !closeOnConfirmStart ? 'ПРОЦЕСС...' : confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
