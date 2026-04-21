import React, { useState, useEffect, useMemo, Suspense } from 'react';
import client from '../api/client';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, setDefaultWarehouse } from '../api/warehouses.api';
import { 
  Warehouse, 
  Users, 
  User,
  Shield, 
  ShieldCheck,
  Star,
  Plus, 
  Trash2, 
  Edit,
  MapPin,
  Phone,
  Settings as SettingsIcon,
  Eye,
  Lock,
  CheckCircle2,
  X,
  Save,
  Globe,
  Settings,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { getCurrentUser } from '../utils/userAccess';
import { updateStoredUser } from '../utils/authStorage';
import TwoFactorSettingsCard from '../components/settings/TwoFactorSettingsCard';
import UserTwoFactorModal from '../components/settings/UserTwoFactorModal';
import { invalidateSettingsReferenceCache } from '../api/settings-reference.api';
import PaginationControls from '../components/common/PaginationControls';

const ConfirmationModal = React.lazy(() => import('../components/common/ConfirmationModal'));

export default function SettingsView() {
  const warehousesPageSize = 8;

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [companyProfile, setCompanyProfile] = useState({ name: '', country: '', region: '', city: '', addressLine: '', phone: '', note: '' });
  const [activeTab, setActiveTab] = useState<'warehouses' | 'users' | 'general' | 'profile'>('warehouses');
  
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showEditWarehouse, setShowEditWarehouse] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', city: '', address: '', phone: '' });

  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', confirmPassword: '', role: 'SELLER', warehouseId: '', canCancelInvoices: false, canDeleteData: false });
  const [warehousePage, setWarehousePage] = useState(1);

  const currentUser = useMemo(() => getCurrentUser(), []);
  const isAdmin = currentUser.role === 'ADMIN';

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const wData = await getWarehouses();
      setWarehouses(Array.isArray(wData) ? wData : []);
      if (isAdmin) {
        const sRes = await client.get('/settings');
        setSettings(sRes.data);
        const companyRes = await client.get('/settings/company-profile');
        setCompanyProfile(companyRes.data || companyProfile);
        const uRes = await client.get('/auth/users');
        setUsers(uRes.data || []);
      }
    } catch (err) { console.error(err); }
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      await client.post('/settings', { key, value });
      invalidateSettingsReferenceCache();
      setSettings((prev: any) => ({ ...prev, [key]: value }));
      toast.success('Настройка обновлена');
    } catch (err) { toast.error('Ошибка сохранения'); }
  };

  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createWarehouse(warehouseForm);
      toast.success('Склад успешно создан');
      setShowAddWarehouse(false);
      setWarehouseForm({ name: '', city: '', address: '', phone: '' });
      fetchData();
    } catch (err) {
      toast.error('Ошибка при создании склада');
    }
  };

  const handleEditWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouse) return;
    try {
      await updateWarehouse(selectedWarehouse.id, warehouseForm);
      toast.success('Склад успешно обновлен');
      setShowEditWarehouse(false);
      setSelectedWarehouse(null);
      setWarehouseForm({ name: '', city: '', address: '', phone: '' });
      fetchData();
    } catch (err) {
      toast.error('Ошибка при обновлении склада');
    }
  };

  const handleDeleteWarehouse = async () => {
    if (!selectedWarehouse) return;
    try {
      await deleteWarehouse(selectedWarehouse.id);
      toast.success('Склад удален');
      setShowDeleteConfirm(false);
      setSelectedWarehouse(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при удалении склада. Возможно, на нем есть остатки.');
    }
  };

  const handleSetDefaultWarehouse = async (warehouseId: number) => {
    try {
      await setDefaultWarehouse(warehouseId);
      toast.success('Основной склад обновлен');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при выборе основного склада');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userForm.password !== userForm.confirmPassword) {
      return toast.error('Пароли не совпадают');
    }
    try {
      await client.post('/auth/register', {
        ...userForm,
        warehouseId: userForm.warehouseId ? Number(userForm.warehouseId) : null
      });
      toast.success('Пользователь создан');
      setShowAddUser(false);
      setUserForm({ username: '', password: '', confirmPassword: '', role: 'SELLER', warehouseId: '', canCancelInvoices: false, canDeleteData: false });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка при создании пользователя');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (userForm.password && userForm.password !== userForm.confirmPassword) {
      return toast.error('Пароли не совпадают');
    }
    try {
      const data: any = {
        role: userForm.role,
        warehouseId: userForm.warehouseId ? Number(userForm.warehouseId) : null,
        canCancelInvoices: userForm.canCancelInvoices,
        canDeleteData: userForm.canDeleteData
      };
      if (userForm.password) data.password = userForm.password;

      await client.put(`/auth/users/${selectedUser.id}`, data);
      toast.success('Данные обновлены');
      setShowEditUser(false);
      setSelectedUser(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка обновления');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await client.delete(`/auth/users/${selectedUser.id}`);
      toast.success('Пользователь удален');
      setShowDeleteUserConfirm(false);
      setSelectedUser(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Ошибка удаления');
    }
  };

  const currentWarehouses = warehouses.slice((warehousePage - 1) * warehousesPageSize, warehousePage * warehousesPageSize);
  const totalWPages = Math.ceil(warehouses.length / warehousesPageSize) || 1;

  const tabs = [
    { id: 'warehouses', label: 'Склады и точки', icon: Warehouse },
    { id: 'users', label: 'Пользователи', icon: Users, adminOnly: true },
    { id: 'general', label: 'Реквизиты компании', icon: SettingsIcon, adminOnly: true },
    { id: 'profile', label: 'Мой профиль', icon: User }
  ];

  return (
    <div className="flex h-full bg-[#f0f1f4]">
      {/* Sidebar 1C Style */}
      <div className="w-64 bg-white border-r border-border-base flex flex-col shrink-0 overflow-y-auto">
         <div className="p-5 border-b border-border-base">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Разделы</h2>
            <div className="text-sm font-black text-slate-900 uppercase">Настройки системы</div>
         </div>
         <div className="p-2 space-y-1">
            {tabs.map(tab => {
                if (tab.adminOnly && !isAdmin) return null;
                const Icon = tab.icon;
                return (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-[2px] transition-all text-left",
                      activeTab === tab.id ? "bg-brand-yellow text-slate-900 border-l-4 border-l-brand-orange" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <Icon size={16} />
                    <span className="text-xs font-black uppercase tracking-tighter">{tab.label}</span>
                  </button>
                );
            })}
         </div>
         
         <div className="mt-auto p-5 border-t border-border-base bg-[#f8f9fb]">
            <div className="flex items-center gap-2 mb-4">
               <div className="w-8 h-8 rounded-full bg-brand-yellow flex items-center justify-center font-black text-xs">
                  {currentUser.username?.[0].toUpperCase()}
               </div>
               <div className="min-w-0">
                  <div className="text-[11px] font-black text-slate-800 truncate uppercase">{currentUser.username}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase">{currentUser.role}</div>
               </div>
            </div>
            <button className="w-full btn-1c !bg-white !text-rose-500 hover:!bg-rose-50 !py-2 text-[10px]" onClick={() => { localStorage.clear(); window.location.href = '/login'; }}>ВЫЙТИ ИЗ СИСТЕМЫ</button>
         </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
         <div className="bg-white border-b border-border-base p-4 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
               {(() => {
                 const TabIcon = tabs.find(t => t.id === activeTab)?.icon || SettingsIcon;
                 return <div className="bg-slate-100 p-2 rounded"><TabIcon size={18} className="text-slate-600" /></div>
               })()}
               <div>
                  <h1 className="text-lg font-black text-slate-800 uppercase tracking-tighter">{tabs.find(t => t.id === activeTab)?.label}</h1>
                  <p className="text-[9px] font-black uppercase text-slate-400 italic">Код раздела: SETTINGS_{activeTab.toUpperCase()}</p>
               </div>
            </div>
            {activeTab === 'warehouses' && isAdmin && (
               <button onClick={() => { setWarehouseForm({ name: '', city: '', address: '', phone: '' }); setShowAddWarehouse(true); }} className="btn-1c !bg-brand-yellow !border-brand-orange/30 flex items-center gap-2"><Plus size={14} /> ДОБАВИТЬ СКЛАД</button>
            )}
            {activeTab === 'users' && isAdmin && (
               <button onClick={() => setShowAddUser(true)} className="btn-1c !bg-brand-yellow !border-brand-orange/30 flex items-center gap-2"><Plus size={14} /> НОВЫЙ ПОЛЬЗОВАТЕЛЬ</button>
            )}
         </div>

         <div className="flex-1 overflow-auto p-6">
            <div className="bg-white border border-border-base rounded-[2px] shadow-sm overflow-hidden min-h-full flex flex-col">
               {/* TAB: WAREHOUSES */}
               {activeTab === 'warehouses' && (
                  <>
                     <table className="table-1c border-separate border-spacing-0">
                        <thead>
                           <tr>
                              <th className="w-12 text-center text-[10px]">Код</th>
                              <th>Наименование склада</th>
                              <th>Местонахождение (Город/Адрес)</th>
                              <th>Контактный телефон</th>
                              <th className="w-32 text-center">Статус</th>
                              <th className="w-20">Действия</th>
                           </tr>
                        </thead>
                        <tbody>
                           {currentWarehouses.map(w => (
                              <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="text-center font-mono text-[10px] text-slate-400"># {w.id}</td>
                                 <td className="font-black text-slate-800 uppercase italic tracking-tighter underline decoration-brand-yellow/30 underline-offset-4">{w.name}</td>
                                 <td className="text-slate-600 font-bold">{w.city}, {w.address}</td>
                                 <td className="font-mono text-[11px] font-black text-slate-600">{w.phone || '—'}</td>
                                 <td className="text-center">
                                    {w.isDefault ? (
                                       <span className="px-2 py-0.5 bg-brand-yellow text-[9px] font-black uppercase rounded shadow-sm">ОСНОВНОЙ</span>
                                    ) : (
                                       isAdmin && <button onClick={() => handleSetDefaultWarehouse(w.id)} className="text-[9px] font-black uppercase text-slate-300 hover:text-brand-orange transition-colors">Сделать основным</button>
                                    )}
                                 </td>
                                 <td className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                       <button className="p-1.5 text-slate-400 hover:text-sky-600" onClick={() => { setSelectedWarehouse(w); setWarehouseForm({ city: w.city, name: w.name, address: w.address, phone: w.phone }); setShowEditWarehouse(true); }}><Edit size={14} /></button>
                                       {isAdmin && <button className="p-1.5 text-slate-300 hover:text-rose-500" onClick={() => { setSelectedWarehouse(w); setShowDeleteConfirm(true); }}><Trash2 size={14} /></button>}
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                     <div className="mt-auto border-t border-border-base">
                        <PaginationControls currentPage={warehousePage} totalPages={totalWPages} totalItems={warehouses.length} pageSize={warehousesPageSize} onPageChange={setWarehousePage} />
                     </div>
                  </>
               )}

               {/* TAB: GENERAL SETTINGS */}
               {activeTab === 'general' && (
                  <form onSubmit={async (e) => {
                      e.preventDefault();
                      await client.post('/settings/company-profile', companyProfile);
                      toast.success('Данные предприятия обновлены');
                      fetchData();
                  }} className="p-8 space-y-8 max-w-4xl">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Company Identity */}
                        <div className="space-y-6">
                           <h3 className="text-xs font-black uppercase text-brand-orange border-b border-brand-orange/20 pb-2 flex items-center gap-2 italic">
                              <Globe size={14} /> Реквизиты организации
                           </h3>
                           <div className="space-y-4">
                              <div className="space-y-1">
                                 <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Наименование фирмы</label>
                                 <input value={companyProfile.name} onChange={e => setCompanyProfile({...companyProfile, name: e.target.value})} className="field-1c w-full font-black text-base" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Страна</label>
                                    <input value={companyProfile.country} onChange={e => setCompanyProfile({...companyProfile, country: e.target.value})} className="field-1c w-full font-bold" />
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Город</label>
                                    <input value={companyProfile.city} onChange={e => setCompanyProfile({...companyProfile, city: e.target.value})} className="field-1c w-full font-bold" />
                                 </div>
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Юридический адрес</label>
                                 <input value={companyProfile.addressLine} onChange={e => setCompanyProfile({...companyProfile, addressLine: e.target.value})} className="field-1c w-full font-bold" />
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Контактный номер</label>
                                 <input value={companyProfile.phone} onChange={e => setCompanyProfile({...companyProfile, phone: e.target.value})} className="field-1c w-full font-black text-sky-700" />
                              </div>
                           </div>
                        </div>

                        {/* System Preferences */}
                        <div className="space-y-6">
                           <h3 className="text-xs font-black uppercase text-brand-orange border-b border-brand-orange/20 pb-2 flex items-center gap-2 italic">
                              <Settings size={14} /> Константы программы
                           </h3>
                           <div className="space-y-5">
                              <div className="bg-slate-50 border border-slate-200 p-4 rounded-[4px] space-y-3">
                                 <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase text-slate-600">Отображение цен</span>
                                    <select 
                                       value={settings.priceVisibility || 'everyone'} 
                                       onChange={e => handleUpdateSetting('priceVisibility', e.target.value)}
                                       className="field-1c !py-1 text-[10px] font-bold"
                                    >
                                       <option value="everyone">Для всех</option>
                                       <option value="in_stock">Только в наличии</option>
                                       <option value="nobody">Скрыто</option>
                                    </select>
                                 </div>
                                 <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase text-slate-600">Валюта системы</span>
                                    <select 
                                       value={settings.currency || 'TJS'} 
                                       onChange={e => handleUpdateSetting('currency', e.target.value)}
                                       className="field-1c !py-1 text-[10px] font-bold"
                                    >
                                       <option value="TJS">TJS (Сомони)</option>
                                       <option value="USD">USD ($)</option>
                                       <option value="RUB">RUB (₽)</option>
                                    </select>
                                 </div>
                              </div>
                              
                              <div className="bg-amber-50 border border-amber-200 p-4 rounded-[4px]">
                                 <h4 className="text-[10px] font-black uppercase text-amber-700 flex items-center gap-2 mb-2"><ShieldAlert size={12} /> Безопасность печати</h4>
                                 <p className="text-[9px] font-bold text-amber-600 italic leading-tight mb-3">Настройка автоматической печати чеков при проведении документа в POS-терминале.</p>
                                 <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-slate-700">Автопечать чека</span>
                                    <button 
                                      type="button"
                                      onClick={() => handleUpdateSetting('autoPrint', settings.autoPrint === 'true' ? 'false' : 'true')}
                                      className={clsx(
                                        "w-12 h-6 rounded-full transition-all relative",
                                        settings.autoPrint === 'true' ? "bg-emerald-500" : "bg-slate-300"
                                      )}
                                    >
                                       <div className={clsx("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", settings.autoPrint === 'true' ? "right-1" : "left-1")} />
                                    </button>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="pt-8 border-t border-slate-100 flex justify-end">
                        <button type="submit" className="btn-1c !bg-brand-yellow !border-brand-orange/30 flex items-center gap-2 font-black tracking-widest uppercase !py-3 !px-12">
                           <Save size={18} /> ЗАПИСАТЬ И ЗАКРЫТЬ
                        </button>
                     </div>
                  </form>
               )}

               {/* TAB: USERS */}
               {activeTab === 'users' && isAdmin && (
                  <div className="flex-1 flex flex-col">
                     <table className="table-1c">
                        <thead>
                           <tr>
                              <th className="w-12 text-center">№</th>
                              <th>Имя пользователя (Логин)</th>
                              <th className="w-32 text-center">Роль</th>
                              <th>Склад назначения</th>
                              <th className="w-48 text-center">Безопасность (2FA)</th>
                              <th className="w-20">Действия</th>
                           </tr>
                        </thead>
                        <tbody>
                           {users.map((u, i) => (
                              <tr key={u.id} className="hover:bg-slate-50">
                                 <td className="text-center font-mono text-[10px] text-slate-400">{i+1}</td>
                                 <td className="font-black text-slate-800 uppercase tracking-tighter underline decoration-brand-yellow/30 underline-offset-4">{u.username}</td>
                                 <td className="text-center">
                                    <span className={clsx(
                                       "px-2 py-0.5 rounded-[2px] text-[9px] font-black border uppercase italic",
                                       u.role === 'ADMIN' ? "bg-rose-50 border-rose-200 text-rose-600" : 
                                       u.role === 'MANAGER' ? "bg-sky-50 border-sky-200 text-sky-600" : 
                                       "bg-slate-50 border-slate-200 text-slate-500"
                                    )}>
                                       {u.role === 'ADMIN' ? 'АДМИНИСТРАТОР' : u.role === 'MANAGER' ? 'МЕНЕДЖЕР' : 'ПРОДАВЕЦ'}
                                    </span>
                                 </td>
                                 <td className="font-bold text-slate-500 uppercase text-[10px] italic">{u.warehouse?.name || 'ВСЕ СКЛАДЫ (ЦО)'}</td>
                                 <td className="text-center">
                                    {u.twoFactorEnabled ? (
                                       <div className="flex items-center justify-center gap-1.5 text-emerald-600 font-black text-[9px] uppercase tracking-tighter">
                                          <ShieldCheck size={14} /> ЗАЩИЩЕН (2FA)
                                       </div>
                                    ) : (
                                       <div className="flex items-center justify-center gap-1.5 text-slate-300 font-black text-[9px] uppercase tracking-tighter">
                                          <Shield size={14} /> БЕЗ ЗАЩИТЫ
                                       </div>
                                    )}
                                 </td>
                                 <td className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                       <button 
                                          className="p-1 text-slate-400 hover:text-sky-600"
                                          onClick={() => {
                                             setSelectedUser(u);
                                             setUserForm({
                                                ...userForm,
                                                role: u.role,
                                                warehouseId: u.warehouseId ? String(u.warehouseId) : '',
                                                canCancelInvoices: u.canCancelInvoices,
                                                canDeleteData: u.canDeleteData,
                                                password: '',
                                                confirmPassword: ''
                                             });
                                             setShowEditUser(true);
                                          }}
                                       >
                                          <Edit size={14} />
                                       </button>
                                       <button 
                                          className="p-1 text-slate-300 hover:text-rose-500"
                                          onClick={() => {
                                             setSelectedUser(u);
                                             setShowDeleteUserConfirm(true);
                                          }}
                                       >
                                          <Trash2 size={14} />
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               )}

               {/* TAB: PROFILE */}
               {activeTab === 'profile' && (
                  <div className="p-12 flex items-start gap-12">
                     <div className="w-64 space-y-6">
                        <div className="aspect-square bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300 relative border-2 border-dashed border-slate-200 group">
                           <User size={80} strokeWidth={1} />
                           <div className="absolute inset-0 bg-brand-yellow/80 rounded-3xl opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer">
                              <span className="text-[10px] font-black uppercase text-slate-900 border-2 border-slate-900 px-3 py-1 rotate-[-10deg]">Сменить фото</span>
                           </div>
                        </div>
                        <div className="bg-[#f8f9fb] border border-border-base p-4 rounded-[4px] space-y-2">
                           <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest italic">Ранг сотрудника</div>
                           <div className="text-lg font-black text-slate-800 uppercase tracking-tighter leading-tight italic">{currentUser.role === 'ADMIN' ? 'Генеральный директор' : 'Старший менеджер'}</div>
                           <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[10px] uppercase">
                              <CheckCircle2 size={12} /> Система в норме
                           </div>
                        </div>
                     </div>
                     <div className="flex-1 max-w-xl space-y-8">
                        <h3 className="text-xs font-black uppercase text-brand-orange border-b border-brand-orange/20 pb-2 flex items-center gap-2 italic">
                           <Lock size={14} /> Учетные данные и безопасность
                        </h3>
                        <form className="space-y-5">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Текущий логин (ID)</label>
                                <input value={currentUser.username} disabled className="field-1c w-full bg-slate-50 text-slate-400 font-black" />
                                <p className="text-[9px] font-bold text-slate-400 italic">Смена логина доступна только администратору системы.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4">
                               <div className="space-y-1">
                                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Новый пароль</label>
                                  <input type="password" placeholder="••••••••" className="field-1c w-full" />
                               </div>
                               <div className="space-y-1">
                                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Повтор пароля</label>
                                  <input type="password" placeholder="••••••••" className="field-1c w-full" />
                               </div>
                            </div>
                            <div className="pt-6">
                               <button type="button" className="btn-1c !bg-brand-yellow !border-brand-orange/30 flex items-center gap-2 font-black tracking-widest uppercase !py-3 !px-8">
                                  ОБНОВИТЬ ПАРОЛЬ ВХОДА
                               </button>
                            </div>
                        </form>

                        <div className="pt-12">
                           <h3 className="text-xs font-black uppercase text-brand-orange border-b border-brand-orange/20 pb-2 flex items-center gap-2 italic mb-6">
                              <ShieldCheck size={14} /> Двухфакторная идентификация (2FA)
                           </h3>
                           <div className="bg-slate-900 rounded-[4px] p-6 text-white flex items-center justify-between shadow-xl">
                              <div className="flex items-center gap-4">
                                 <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                                    <ShieldCheck size={32} className="text-brand-yellow" />
                                 </div>
                                 <div className="min-w-0">
                                    <div className="text-sm font-black uppercase tracking-widest">Защита аккаунта {currentUser.twoFactorEnabled ? 'АКТИВНА' : 'ОТКЛЮЧЕНА'}</div>
                                    <p className="text-[10px] font-bold text-slate-400 italic mt-1 leading-tight max-w-xs">Используйте Google Authenticator для подтверждения входа. Это гарантирует безопасность ваших данных.</p>
                                 </div>
                              </div>
                              <button className="btn-1c !bg-brand-yellow !text-slate-900 border-none !py-2 !px-6 shadow-lg shadow-brand-yellow/20">
                                 {currentUser.twoFactorEnabled ? 'НАСТРОИТЬ' : 'ВКЛЮЧИТЬ'}
                              </button>
                           </div>
                        </div>
                     </div>
                  </div>
               )}
            </div>
         </div>
      </div>

      {/* Warehouse Modal (ADD) */}
      <AnimatePresence>
      {showAddWarehouse && (
         <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddWarehouse(false)} />
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-md rounded-[4px] shadow-2xl border-t-4 border-t-brand-yellow overflow-hidden">
                 <div className="bg-slate-50 px-5 py-3 border-b border-border-base flex items-center justify-between">
                     <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2 italic">
                        <Warehouse size={14} className="text-brand-orange" /> Регистрация нового склада
                     </h3>
                     <button onClick={() => setShowAddWarehouse(false)} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
                 </div>
                 <div className="p-6">
                     <form onSubmit={handleAddWarehouse} className="space-y-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Наименование объекта</label>
                           <input 
                             required 
                             value={warehouseForm.name} 
                             onChange={e => setWarehouseForm({...warehouseForm, name: e.target.value})} 
                             className="field-1c w-full font-black text-slate-800"
                             placeholder="Напр: Склад №3 (Южный)"
                           />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Город</label>
                              <input required value={warehouseForm.city} onChange={e => setWarehouseForm({...warehouseForm, city: e.target.value})} className="field-1c w-full font-bold" />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Контактный телефон</label>
                              <input required value={warehouseForm.phone} onChange={e => setWarehouseForm({...warehouseForm, phone: e.target.value})} className="field-1c w-full font-bold" />
                           </div>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Строка адреса</label>
                           <input required value={warehouseForm.address} onChange={e => setWarehouseForm({...warehouseForm, address: e.target.value})} className="field-1c w-full font-bold h-12" />
                        </div>
                        <div className="pt-4">
                           <button type="submit" className="w-full btn-1c !bg-brand-yellow !border-brand-orange/30 !py-4 font-black tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3">
                              <Save size={18} /> ЗАПИСАТЬ СКЛАД
                           </button>
                        </div>
                     </form>
                 </div>
             </motion.div>
         </div>
      )}
      </AnimatePresence>

      {/* Warehouse Modal (EDIT) */}
      <AnimatePresence>
      {showEditWarehouse && (
         <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditWarehouse(false)} />
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-md rounded-[4px] shadow-2xl border-t-4 border-t-sky-500 overflow-hidden">
                 <div className="bg-slate-50 px-5 py-3 border-b border-border-base flex items-center justify-between">
                     <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2 italic">
                        <Edit size={14} className="text-sky-600" /> Редактирование: {selectedWarehouse?.name}
                     </h3>
                     <button onClick={() => setShowEditWarehouse(false)} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
                 </div>
                 <div className="p-6">
                     <form onSubmit={handleEditWarehouse} className="space-y-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Наименование объекта</label>
                           <input 
                             required 
                             value={warehouseForm.name} 
                             onChange={e => setWarehouseForm({...warehouseForm, name: e.target.value})} 
                             className="field-1c w-full font-black text-slate-800"
                           />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Город</label>
                              <input required value={warehouseForm.city} onChange={e => setWarehouseForm({...warehouseForm, city: e.target.value})} className="field-1c w-full font-bold" />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Контактный телефон</label>
                              <input required value={warehouseForm.phone} onChange={e => setWarehouseForm({...warehouseForm, phone: e.target.value})} className="field-1c w-full font-bold" />
                           </div>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Строка адреса</label>
                           <input required value={warehouseForm.address} onChange={e => setWarehouseForm({...warehouseForm, address: e.target.value})} className="field-1c w-full font-bold h-12" />
                        </div>
                        <div className="pt-4 flex gap-3">
                           <button type="submit" className="flex-1 btn-1c !bg-sky-600 !text-white !border-sky-700 !py-4 font-black tracking-widest uppercase transition-all active:scale-95 flex items-center justify-center gap-2">
                              <Save size={18} /> СОХРАНИТЬ
                           </button>
                           <button type="button" onClick={() => setShowEditWarehouse(false)} className="flex-1 btn-1c !bg-slate-100 !py-4 font-black tracking-widest uppercase">
                              ОТМЕНА
                           </button>
                        </div>
                     </form>
                 </div>
             </motion.div>
         </div>
      )}
      </AnimatePresence>

      <Suspense fallback={null}>
         <ConfirmationModal 
            isOpen={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={handleDeleteWarehouse}
            title="Удаление склада"
            message={`Вы действительно хотите удалить склад "${selectedWarehouse?.name}"? Это действие невозможно отменить.`}
            confirmText="УДАЛИТЬ СКЛАД"
            cancelText="ОТМЕНА"
            type="danger"
         />
         <ConfirmationModal 
            isOpen={showDeleteUserConfirm}
            onClose={() => setShowDeleteUserConfirm(false)}
            onConfirm={handleDeleteUser}
            title="Удаление пользователя"
            message={`Вы действительно хотите удалить пользователя "${selectedUser?.username}"? Он больше не сможет войти в систему.`}
            confirmText="УДАЛИТЬ ПОЛЬЗОВАТЕЛЯ"
            cancelText="ОТМЕНА"
            type="danger"
         />
      </Suspense>

      {/* User Modal (ADD) */}
      <AnimatePresence>
        {showAddUser && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddUser(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-lg rounded-[4px] shadow-2xl border-t-4 border-t-brand-yellow overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-border-base flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2 italic">
                  <Users size={14} className="text-brand-orange" /> Новый пользователь системы
                </h3>
                <button onClick={() => setShowAddUser(false)} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Логин для входа</label>
                  <input required value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} className="field-1c w-full font-black uppercase" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Пароль</label>
                    <input required type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className="field-1c w-full" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Подтверждение</label>
                    <input required type="password" value={userForm.confirmPassword} onChange={e => setUserForm({ ...userForm, confirmPassword: e.target.value })} className="field-1c w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Роль (Доступ)</label>
                    <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className="field-1c w-full font-bold">
                      <option value="SELLER">Продавец</option>
                      <option value="MANAGER">Менеджер</option>
                      <option value="ADMIN">Администратор</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Привязка к складу</label>
                    <select value={userForm.warehouseId} onChange={e => setUserForm({ ...userForm, warehouseId: e.target.value })} className="field-1c w-full font-bold">
                      <option value="">Все склады (ЦО)</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-3 mt-4">
                   <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Дополнительные привилегии</p>
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={userForm.canCancelInvoices} onChange={e => setUserForm({...userForm, canCancelInvoices: e.target.checked})} className="sr-only peer" />
                      <div className="w-10 h-5 bg-slate-200 peer-checked:bg-emerald-500 rounded-full transition-all relative">
                         <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-600">Разрешить отмену накладных</span>
                   </label>
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={userForm.canDeleteData} onChange={e => setUserForm({...userForm, canDeleteData: e.target.checked})} className="sr-only peer" />
                      <div className="w-10 h-5 bg-slate-200 peer-checked:bg-rose-500 rounded-full transition-all relative">
                         <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-600">Разрешить удаление данных</span>
                   </label>
                </div>
                <div className="pt-4">
                   <button type="submit" className="w-full btn-1c !bg-brand-yellow !border-brand-orange/30 !py-4 font-black tracking-widest uppercase">ЗАРЕГИСТРИРОВАТЬ</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Modal (EDIT) */}
      <AnimatePresence>
        {showEditUser && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditUser(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-lg rounded-[4px] shadow-2xl border-t-4 border-t-sky-500 overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-border-base flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2 italic">
                  <Edit size={14} className="text-sky-600" /> Редактирование: {selectedUser?.username}
                </h3>
                <button onClick={() => setShowEditUser(false)} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
              </div>
              <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Роль (Доступ)</label>
                    <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className="field-1c w-full font-bold">
                      <option value="SELLER">Продавец</option>
                      <option value="MANAGER">Менеджер</option>
                      <option value="ADMIN">Администратор</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Склад</label>
                    <select value={userForm.warehouseId} onChange={e => setUserForm({ ...userForm, warehouseId: e.target.value })} className="field-1c w-full font-bold">
                      <option value="">Все склады (ЦО)</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200 mt-4 space-y-4">
                   <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Смена пароля (оставьте пустым если не меняется)</label>
                      <div className="grid grid-cols-2 gap-2">
                         <input type="password" placeholder="Новый пароль" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="field-1c w-full" />
                         <input type="password" placeholder="Повтор" value={userForm.confirmPassword} onChange={e => setUserForm({...userForm, confirmPassword: e.target.value})} className="field-1c w-full" />
                      </div>
                   </div>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-3">
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={userForm.canCancelInvoices} onChange={e => setUserForm({...userForm, canCancelInvoices: e.target.checked})} className="sr-only peer" />
                      <div className="w-10 h-5 bg-slate-200 peer-checked:bg-emerald-500 rounded-full transition-all relative">
                         <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-600">Разрешить отмену накладных</span>
                   </label>
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={userForm.canDeleteData} onChange={e => setUserForm({...userForm, canDeleteData: e.target.checked})} className="sr-only peer" />
                      <div className="w-10 h-5 bg-slate-200 peer-checked:bg-rose-500 rounded-full transition-all relative">
                         <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-600">Разрешить удаление данных</span>
                   </label>
                </div>
                <div className="pt-4 flex gap-2">
                   <button type="submit" className="flex-1 btn-1c !bg-sky-600 !text-white border-none !py-4 font-black tracking-widest uppercase">СОХРАНИТЬ</button>
                   <button type="button" onClick={() => setShowEditUser(false)} className="flex-1 btn-1c !bg-slate-100 !py-4 font-black tracking-widest uppercase">ОТМЕНА</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
