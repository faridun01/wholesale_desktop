import React, { useState, useEffect } from 'react';
import { History, Search, Filter, ArrowUpRight, ArrowDownLeft, RefreshCcw } from 'lucide-react';
import { Card, Badge } from '../components/UI';
import client from '../api/client';
import toast from 'react-hot-toast';
import PaginationControls from '../components/common/PaginationControls';

interface Transaction {
  id: number;
  product_name: string;
  qtyChange: number;
  type: string;
  reason: string;
  username: string;
  createdAt: string;
}

export default function HistoryView() {
  const pageSize = 15;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await client.get('/reports/transactions');
      setTransactions(res.data);
      setCurrentPage(1);
    } catch (err) {
      toast.error('Ошибка при загрузке истории');
    } finally {
      setLoading(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'incoming': return <Badge variant="success">Приход</Badge>;
      case 'outgoing': return <Badge variant="danger">Расход</Badge>;
      case 'return': return <Badge variant="warning">Возврат</Badge>;
      case 'transfer': return <Badge variant="default">Перевод</Badge>;
      default: return <Badge variant="default">{type}</Badge>;
    }
  };

  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
  const paginatedTransactions = transactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="app-page-shell">
      <div className="w-full space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-medium tracking-tight text-slate-900">История</h1>
          <p className="text-slate-500 mt-1 font-medium">Лог всех складских операций.</p>
        </div>
        <button 
          onClick={fetchHistory}
          className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-indigo-600 hover:border-indigo-600 transition-all shadow-sm"
        >
          <RefreshCcw size={24} />
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto -mx-8">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-8 py-4">Дата</th>
                <th className="px-8 py-4">Товар</th>
                <th className="px-8 py-4">Тип</th>
                <th className="px-8 py-4">Кол-во</th>
                <th className="px-8 py-4">Сотрудник</th>
                <th className="px-8 py-4">Причина</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-8 py-4 text-slate-500 font-bold">
                    {new Date(t.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-8 py-4 font-black text-slate-900">{t.product_name}</td>
                  <td className="px-8 py-4">{getTypeBadge(t.type)}</td>
                  <td className={`px-8 py-4 font-black ${t.qtyChange > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t.qtyChange > 0 ? `+${t.qtyChange}` : t.qtyChange}
                  </td>
                  <td className="px-8 py-4 text-slate-600 font-bold">{t.username}</td>
                  <td className="px-8 py-4 text-slate-500 italic text-sm">{t.reason}</td>
                </tr>
              ))}
              {transactions.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-8 py-16 text-center text-slate-400 font-bold">История пуста</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={transactions.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </Card>
      </div>
    </div>
  );
}
