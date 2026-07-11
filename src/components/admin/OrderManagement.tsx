import { useState, useEffect } from 'react';
import { Search, Filter, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';
import { supabase, Order } from '../../lib/supabase';

export const OrderManagement = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = orders;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(order =>
        order.order_number.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredOrders(filtered);
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const updateData: any = {
        status: newStatus,
        payment_status: newStatus === 'completed' ? 'paid' : 'pending',
      };

      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      await fetchOrders();
      setSelectedOrder(null);
      alert('تم تحديث حالة الطلب بنجاح');
    } catch (error) {
      console.error('Error updating order:', error);
      alert('حدث خطأ أثناء التحديث');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'processing':
        return 'bg-blue-500/20 text-blue-400';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'مكتمل';
      case 'pending':
        return 'قيد الانتظار';
      case 'processing':
        return 'قيد التنفيذ';
      case 'cancelled':
        return 'ملغي';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-axie-gold border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <h2 className="text-2xl sm:text-3xl font-changa font-bold">إدارة الطلبات</h2>

      <div className="glass-panel p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex-1 relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث برقم الطلب..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 text-white placeholder-white/30"
            />
          </div>
          {/* Status filter — horizontal scroll on mobile */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(['all', 'pending', 'processing', 'completed', 'cancelled'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                  statusFilter === status
                    ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                    : 'bg-white/5 hover:bg-white/10 text-white/60'
                }`}
              >
                {status === 'all' ? 'الكل' : getStatusText(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">لا توجد طلبات</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white/50">رقم الطلب</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white/50">التاريخ</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white/50">المبلغ</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white/50">الحالة</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white/50">الدفع</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white/50">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-white/[0.03] transition-all">
                      <td className="px-4 py-3 font-bold text-xs">{order.order_number}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{new Date(order.created_at).toLocaleDateString('ar-SA')}</td>
                      <td className="px-4 py-3"><span className="font-bold text-amber-400 text-xs">{order.final_amount} د.ل</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>{getStatusText(order.status)}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(order.payment_status)}`}>{getStatusText(order.payment_status)}</span></td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedOrder(order)} className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-all">
                          <Eye className="w-4 h-4 text-amber-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-white/5">
              {filteredOrders.map((order) => (
                <div key={order.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{order.order_number}</span>
                    <span className="font-bold text-sm text-amber-400">{order.final_amount} د.ل</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>{getStatusText(order.status)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(order.payment_status)}`}>{getStatusText(order.payment_status)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">{new Date(order.created_at).toLocaleDateString('ar-SA')}</span>
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/8 hover:bg-white/15 text-amber-400 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      عرض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="glass-panel p-5 sm:p-6 w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">تفاصيل الطلب</h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-sm text-axie-purple-light">رقم الطلب</p>
                  <p className="font-bold">{selectedOrder.order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-axie-purple-light">التاريخ</p>
                  <p className="font-bold">
                    {new Date(selectedOrder.created_at).toLocaleString('ar-SA')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-axie-purple-light">المبلغ الأساسي</p>
                  <p className="font-bold">{selectedOrder.amount} د.ل</p>
                </div>
                <div>
                  <p className="text-sm text-axie-purple-light">الخصم</p>
                  <p className="font-bold text-green-400">{selectedOrder.discount_amount} د.ل</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-axie-purple-light">المبلغ النهائي</p>
                  <p className="text-2xl font-bold text-axie-gold">{selectedOrder.final_amount} د.ل</p>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <p className="text-sm text-axie-purple-light mb-2">ملاحظات</p>
                  <p className="glass-panel p-3">{selectedOrder.notes}</p>
                </div>
              )}

              <div className="pt-4 border-t border-white/10">
                <p className="text-sm font-bold mb-3">تحديث حالة الطلب</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'processing')}
                    className="flex-1 py-2 px-4 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-all"
                    disabled={selectedOrder.status === 'processing'}
                  >
                    قيد التنفيذ
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'completed')}
                    className="flex-1 py-2 px-4 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-all flex items-center justify-center gap-2"
                    disabled={selectedOrder.status === 'completed'}
                  >
                    <CheckCircle className="w-4 h-4" />
                    مكتمل
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                    className="flex-1 py-2 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all"
                    disabled={selectedOrder.status === 'cancelled'}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
