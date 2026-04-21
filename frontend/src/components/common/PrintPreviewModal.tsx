
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Printer, Download, Eye } from 'lucide-react';
import { clsx } from 'clsx';

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  html: string;
  type: 'a4' | 'receipt';
}

export default function PrintPreviewModal({ isOpen, onClose, title, html, type }: PrintPreviewModalProps) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    // Small timeout to ensure styles are loaded before print dialog
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        // Option to close after print, but usually better to leave to user
    }, 250);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 lg:p-10">
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative bg-[#323639] w-full max-w-5xl h-full flex flex-col rounded-lg shadow-2xl overflow-hidden border border-white/10"
        >
          {/* Header */}
          <div className="bg-[#202124] px-6 py-3 flex items-center justify-between text-white border-b border-white/5">
             <div className="flex items-center gap-3">
                <div className="bg-brand-yellow p-1.5 rounded text-slate-900">
                   <Eye size={18} strokeWidth={3} />
                </div>
                <div>
                   <h2 className="text-sm font-black uppercase tracking-widest">{title}</h2>
                   <p className="text-[10px] text-slate-400 font-bold uppercase italic">Предварительный просмотр документа</p>
                </div>
             </div>
             
             <div className="flex items-center gap-4">
                <button 
                  onClick={handlePrint}
                  className="bg-brand-orange hover:bg-brand-yellow text-white hover:text-slate-900 px-4 py-2 rounded font-black text-xs flex items-center gap-2 transition-all shadow-lg active:scale-95"
                >
                   <Printer size={16} /> ПЕЧАТЬ
                </button>
                <div className="w-[1px] h-6 bg-white/10 mx-2"></div>
                <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                   <X size={24} />
                </button>
             </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 overflow-auto p-10 flex justify-center bg-[#525659]">
             <div 
               className={clsx(
                 "bg-white shadow-2xl transform transition-transform duration-500",
                 type === 'a4' ? "w-[210mm] min-h-[297mm] p-[10mm]" : "w-[80mm] min-h-[150mm] p-4"
               )}
               dangerouslySetInnerHTML={{ __html: html }}
             />
          </div>

          {/* Footer Info */}
          <div className="bg-[#202124] px-6 py-2 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase tracking-widest">
             Wholesale CRM Systems &copy; 2026 | Система документооборота
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
