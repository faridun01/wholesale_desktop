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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!isSubmitting) {
              onClose();
            }
          }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-[2rem]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-6">
              <h3 className="text-lg font-black text-slate-900 sm:text-xl">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={24} />
              </button>
            </div>

            <div className="overflow-y-auto p-5 text-center sm:p-8">
              <div
                className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
                  type === 'danger'
                    ? 'bg-rose-50 text-rose-600'
                    : type === 'warning'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                <AlertTriangle size={40} />
              </div>
              <p className="font-medium leading-relaxed text-slate-600">{message}</p>
            </div>

            <div className="flex flex-col gap-3 bg-slate-50 p-4 sm:flex-row sm:p-6">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 rounded-xl px-6 py-3 font-bold text-slate-500 transition-all hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className={`flex-1 rounded-xl px-6 py-3 font-bold text-white shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                  type === 'danger'
                    ? 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'
                    : type === 'warning'
                      ? 'bg-amber-600 shadow-amber-600/20 hover:bg-amber-700'
                      : 'bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-700'
                }`}
              >
                {isSubmitting && !closeOnConfirmStart ? 'Подождите...' : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
