import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Edit2, Gift, Calendar } from 'lucide-react';
import { supabase, Offer } from '../../lib/supabase';

export const OfferManagement = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [showNewOfferForm, setShowNewOfferForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOffers(data || []);
    } catch (error) {
      console.error('Error fetching offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOffer = async () => {
    if (!editingOffer) return;

    try {
      if (editingOffer.id === 'new') {
        const { error } = await supabase.from('offers').insert({
          title: editingOffer.title,
          description: editingOffer.description,
          discount_type: editingOffer.discount_type,
          discount_value: editingOffer.discount_value,
          code: editingOffer.code || null,
          valid_from: editingOffer.valid_from,
          valid_until: editingOffer.valid_until || null,
          max_uses: editingOffer.max_uses || null,
          is_active: editingOffer.is_active,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('offers')
          .update({
            title: editingOffer.title,
            description: editingOffer.description,
            discount_type: editingOffer.discount_type,
            discount_value: editingOffer.discount_value,
            code: editingOffer.code,
            valid_from: editingOffer.valid_from,
            valid_until: editingOffer.valid_until,
            max_uses: editingOffer.max_uses,
            is_active: editingOffer.is_active,
          })
          .eq('id', editingOffer.id);

        if (error) throw error;
      }

      await fetchOffers();
      setEditingOffer(null);
      setShowNewOfferForm(false);
      alert('تم حفظ العرض بنجاح');
    } catch (error) {
      console.error('Error saving offer:', error);
      alert('حدث خطأ أثناء الحفظ');
    }
  };

  const handleDeleteOffer = async (offerId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا العرض؟')) return;

    try {
      const { error } = await supabase
        .from('offers')
        .delete()
        .eq('id', offerId);

      if (error) throw error;

      await fetchOffers();
      alert('تم حذف العرض بنجاح');
    } catch (error) {
      console.error('Error deleting offer:', error);
      alert('حدث خطأ أثناء الحذف');
    }
  };

  const handleNewOffer = () => {
    setEditingOffer({
      id: 'new',
      title: '',
      description: '',
      discount_type: 'percentage',
      discount_value: 0,
      valid_from: new Date().toISOString(),
      used_count: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setShowNewOfferForm(true);
  };

  const isOfferActive = (offer: Offer) => {
    if (!offer.is_active) return false;
    const now = new Date();
    const validUntil = offer.valid_until ? new Date(offer.valid_until) : null;
    return !validUntil || validUntil > now;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-axie-gold border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-changa font-bold">إدارة العروض</h2>
        <button onClick={handleNewOffer} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          إضافة عرض جديد
        </button>
      </div>

      {(showNewOfferForm && editingOffer) && (
        <div className="glass-panel p-6 space-y-4">
          <h3 className="text-xl font-bold">عرض جديد</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold mb-2">عنوان العرض</label>
              <input
                type="text"
                value={editingOffer.title}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, title: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                placeholder="مثال: خصم 50% على جميع الخدمات"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold mb-2">الوصف</label>
              <textarea
                value={editingOffer.description}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, description: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                rows={3}
                placeholder="وصف العرض"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">نوع الخصم</label>
              <select
                value={editingOffer.discount_type}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, discount_type: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
              >
                <option value="percentage">نسبة مئوية %</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">قيمة الخصم</label>
              <input
                type="number"
                value={editingOffer.discount_value}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, discount_value: parseFloat(e.target.value) })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">كود الخصم (اختياري)</label>
              <input
                type="text"
                value={editingOffer.code || ''}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, code: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                placeholder="SUMMER2024"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">الحد الأقصى للاستخدامات (اختياري)</label>
              <input
                type="number"
                value={editingOffer.max_uses || ''}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, max_uses: parseInt(e.target.value) || undefined })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                min="1"
                placeholder="غير محدود"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">تاريخ البداية</label>
              <input
                type="date"
                value={editingOffer.valid_from?.split('T')[0]}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, valid_from: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">تاريخ الانتهاء (اختياري)</label>
              <input
                type="date"
                value={editingOffer.valid_until?.split('T')[0] || ''}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, valid_until: e.target.value || undefined })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="offer-active"
                checked={editingOffer.is_active}
                onChange={(e) =>
                  setEditingOffer({ ...editingOffer, is_active: e.target.checked })
                }
                className="w-5 h-5 rounded border-white/20 text-axie-gold focus:ring-axie-gold"
              />
              <label htmlFor="offer-active" className="text-sm font-bold">
                العرض نشط
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleSaveOffer} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              حفظ العرض
            </button>
            <button
              onClick={() => {
                setEditingOffer(null);
                setShowNewOfferForm(false);
              }}
              className="btn-secondary flex-1"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {offers.map((offer) => (
          <div
            key={offer.id}
            className={`glass-panel p-6 space-y-4 relative ${
              !isOfferActive(offer) ? 'opacity-50' : ''
            }`}
          >
            <div className="absolute top-4 left-4">
              <Gift className="w-8 h-8 text-axie-gold" />
            </div>

            <div className="pr-12">
              <h3 className="text-xl font-bold mb-2">{offer.title}</h3>
              <p className="text-sm text-axie-purple-light">{offer.description}</p>
            </div>

            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-axie-purple-light">الخصم</span>
                <span className="font-bold text-axie-gold">
                  {offer.discount_type === 'percentage'
                    ? `${offer.discount_value}%`
                    : `${offer.discount_value} د.ل`}
                </span>
              </div>

              {offer.code && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-axie-purple-light">الكود</span>
                  <span className="font-mono font-bold bg-white/10 px-3 py-1 rounded">
                    {offer.code}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-axie-purple-light">الاستخدامات</span>
                <span className="font-bold">
                  {offer.used_count} / {offer.max_uses || '∞'}
                </span>
              </div>

              {offer.valid_until && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-axie-purple-light" />
                  <span className="text-axie-purple-light">
                    ينتهي في {new Date(offer.valid_until).toLocaleDateString('ar-SA')}
                  </span>
                </div>
              )}

              <div className={`text-sm font-bold ${isOfferActive(offer) ? 'text-green-400' : 'text-red-400'}`}>
                {isOfferActive(offer) ? '● نشط' : '● منتهي'}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex gap-2">
              <button
                onClick={() => setEditingOffer(offer)}
                className="flex-1 py-2 px-4 bg-white/5 hover:bg-white/10 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                تعديل
              </button>
              <button
                onClick={() => handleDeleteOffer(offer.id)}
                className="flex-1 py-2 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      {offers.length === 0 && !showNewOfferForm && (
        <div className="glass-panel p-12 text-center">
          <Gift className="w-16 h-16 text-axie-purple-light mx-auto mb-4" />
          <p className="text-axie-purple-light">لا توجد عروض حالياً</p>
        </div>
      )}
    </div>
  );
};
