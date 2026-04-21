import React, { useEffect, useState, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, FileText, Phone, MapPin, X, User, RefreshCw, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import client from '../api/client';
import { createCustomer, deleteCustomer, getCustomers, updateCustomer } from '../api/customers.api';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import ConfirmationModal from '../components/common/ConfirmationModal';
import PaginationControls from '../components/common/PaginationControls';
import { getCurrentUser, isAdminUser } from '../utils/userAccess';

const emptyForm = {
  customerType: 'individual',
  name: '',
  customerCategory: '',
  companyName: '',
  contactName: '',
  phone: '',
  country: 'Таджикистан',
  region: '',
  city: '',
  address: '',
  notes: '',
};

export default function CustomerView() {
  const user = useMemo(() => getCurrentUser(), []);
  const isAdmin = isAdminUser(user);
  const pageSize = 15;
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState(emptyForm);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Ошибка загрузки базы контрагентов');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedCustomer) {
        await updateCustomer(selectedCustomer.id, formData);
        toast.success('Данные контрагента обновлены');
      } else {
        await createCustomer(formData);
        toast.success('Контрагент добавлен в базу');
      }
      setIsModalOpen(false);
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при сохранении');
    }
  };

  const handleDelete = async () => {
    if (!selectedCustomer) return;
    try {
      await deleteCustomer(selectedCustomer.id);
      toast.success('Контрагент удален');
      setShowDeleteConfirm(false);
      setSelectedCustomer(null);
      fetchCustomers();
    } catch {
      toast.error('Ошибка при удалении');
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      (c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone?.includes(searchTerm)) &&
      (selectedCategory === 'all' || c.customerCategory === selectedCategory)
    );
  }, [customers, searchTerm, selectedCategory]);

  const paginatedCustomers = useMemo(() => {
    return filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredCustomers, currentPage]);

  const totalPages = Math.ceil(filteredCustomers.length / pageSize) || 1;
  const categories = useMemo(() => Array.from(new Set(customers.map(c => c.customerCategory).filter(Boolean))), [customers]);

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* 1C Toolbar */}
      <div className="toolbar-1c">
        <button 
          onClick={() => { setFormData(emptyForm); setSelectedCustomer(null); setIsModalOpen(true); }} 
          className="btn-1c btn-1c-primary flex items-center gap-1.5"
        >
          <Plus size={14} className="stroke-[3]" /> Создать
        </button>
        <button 
          onClick={() => { 
            if (selectedCustomer) {
              setFormData({
                customerType: selectedCustomer.customerType || 'individual',
                name: selectedCustomer.name || '',
                customerCategory: selectedCustomer.customerCategory || '',
                companyName: selectedCustomer.companyName || '',
                contactName: selectedCustomer.contactName || '',
                phone: selectedCustomer.phone || '',
                country: selectedCustomer.country || 'Таджикистан',
                region: selectedCustomer.region || '',
                city: selectedCustomer.city || '',
                address: selectedCustomer.address || '',
                notes: selectedCustomer.notes || '',
              });
              setIsModalOpen(true); 
            }
          }} 
          disabled={!selectedCustomer} 
          className="btn-1c flex items-center gap-1.5"
        >
          <Edit2 size={14} /> Изменить
        </button>
        <button 
          onClick={() => setShowDeleteConfirm(true)} 
          disabled={!selectedCustomer} 
          className="btn-1c flex items-center gap-1.5 text-rose-600 border-rose-100 hover:bg-rose-50"
        >
          <Trash2 size={14} /> Удалить
        </button>
        
        <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
        
        <button className="btn-1c flex items-center gap-1.5" disabled={!selectedCustomer}>
           <FileText size={14} /> Досье
        </button>

        <div className="flex-1"></div>
        <button onClick={fetchCustomers} className="p-1.5 hover:bg-slate-100 rounded text-slate-400">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#f2f3f7] p-2 flex items-center gap-4 border-b border-border-base">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Поиск по наименованию или телефону..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="field-1c w-full pl-8 py-1"
          />
        </div>
        <select 
          value={selectedCategory} 
          onChange={e => setSelectedCategory(e.target.value)}
          className="field-1c py-1 text-xs font-bold"
        >
          <option value="all">Все категории</option>
          {categories.map(cat => <option key={cat as string} value={cat as string}>{cat as string}</option>)}
        </select>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-[#e6e8eb]">
        <table className="table-1c border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12 text-center">№</th>
              <th>Наименование / Контрагент</th>
              <th className="w-32 text-center">Категория</th>
              <th className="w-40">Телефон</th>
              <th className="w-48">Адрес</th>
              <th className="w-32 text-right">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-20 text-center bg-white italic text-slate-400">Загрузка данных...</td>
              </tr>
            ) : paginatedCustomers.length > 0 ? (
              paginatedCustomers.map((c, idx) => (
                <tr 
                  key={c.id} 
                  onClick={() => setSelectedCustomer(c)}
                  onDoubleClick={() => { setSelectedCustomer(c); setIsModalOpen(true); }}
                  className={clsx(selectedCustomer?.id === c.id && "selected")}
                >
                  <td className="text-center font-mono text-[11px] text-slate-400">{(currentPage-1)*pageSize + idx + 1}</td>
                  <td className="font-bold">{c.name}</td>
                  <td className="text-center italic text-slate-500 uppercase text-[10px]">{c.customerCategory || '—'}</td>
                  <td className="font-mono text-slate-500">{c.phone || '—'}</td>
                  <td className="text-[11px] text-slate-600 truncate max-w-[200px]">{c.address || '—'}</td>
                  <td className={clsx("text-right font-black", Number(c.balance || 0) > 0 ? "text-rose-600" : "text-emerald-700")}>
                    {formatMoney(c.balance || 0)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-20 text-center bg-white text-slate-300 font-bold uppercase">Список пуст</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="bg-[#fcfcfc] border-t border-border-base p-2 px-4 flex items-center justify-between">
        <div className="flex items-center gap-6 text-[11px] font-black uppercase text-slate-400 tracking-widest">
          <span>Всего контрагентов: {filteredCustomers.length}</span>
          <span className="text-rose-400">Общий долг: {formatMoney(filteredCustomers.reduce((acc, c) => acc + Math.max(0, c.balance || 0), 0))}</span>
        </div>
        <PaginationControls 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white border-2 border-brand-orange shadow-2xl rounded w-full max-w-xl overflow-hidden">
               <div className="bg-brand-yellow px-4 py-2 flex items-center justify-between border-b border-black/10">
                 <span className="text-[11px] font-black uppercase tracking-widest text-slate-800">Карточка контрагента: {selectedCustomer ? 'Редактирование' : 'Регистрация'}</span>
                 <button onClick={() => setIsModalOpen(false)} className="hover:text-rose-600"><X size={18} /></button>
               </div>
               <form onSubmit={handleSave} className="p-6 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                   <div className="col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">ФИО / Наименование организации</label>
                     <input autoFocus type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="field-1c w-full" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Категория</label>
                     <input type="text" value={formData.customerCategory} onChange={e => setFormData({ ...formData, customerCategory: e.target.value })} className="field-1c w-full" placeholder="Оптовик, VIP..." />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Телефон</label>
                     <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="field-1c w-full" />
                   </div>
                   <div className="col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Адрес регистрации / Доставки</label>
                     <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="field-1c w-full" />
                   </div>
                   <div className="col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Комментарий</label>
                     <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="field-1c w-full h-20 resize-none pt-2" />
                   </div>
                 </div>
                 <div className="pt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn-1c">Отмена</button>
                    <button type="submit" className="btn-1c btn-1c-primary">Записать и закрыть</button>
                 </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={showDeleteConfirm} 
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title="Удаление контрагента"
        message={`Вы уверены, что хотите удалить "${selectedCustomer?.name}"? История операций будет сохранена.`}
        confirmText="Удалить"
        cancelText="Отмена"
      />
    </div>
  );
}
