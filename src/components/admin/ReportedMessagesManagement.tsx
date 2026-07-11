import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Trash2, CheckCircle, XCircle, Ban, Loader } from 'lucide-react';

interface ReportedMessage {
  id: string;
  message_id: string;
  message_content: string;
  reported_by_username: string;
  report_reason: string;
  report_details: string | null;
  report_status: string;
  reported_at: string;
  message_user_id: string;
  message_author: string;
  report_count: number;
}

export const ReportedMessagesManagement = () => {
  const [reports, setReports] = useState<ReportedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('chat_reports')
        .select(`
          id,
          message_id,
          reported_by,
          reason,
          details,
          status,
          created_at,
          chat_messages:message_id (
            id,
            user_id,
            message,
            users:user_id (
              username
            )
          ),
          reported_user:reported_by (
            username
          )
        `)
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      } else if (filter === 'reviewed') {
        query = query.in('status', ['approved', 'rejected', 'actioned']);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching reports:', error);
        return;
      }

      const formattedData = (data || []).map((report: any) => ({
        id: report.id,
        message_id: report.chat_messages?.id || '',
        message_content: report.chat_messages?.message || '[رسالة محذوفة]',
        reported_by_username: report.reported_user?.username || 'مستخدم غير معروف',
        report_reason: report.reason,
        report_details: report.details,
        report_status: report.status,
        reported_at: report.created_at,
        message_user_id: report.chat_messages?.user_id || '',
        message_author: report.chat_messages?.users?.username || 'مستخدم غير معروف',
      }));

      setReports(formattedData);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteMessage = async (messageId: string, reportId: string) => {
    setProcessingId(reportId);
    try {
      const { error: deleteError } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId);

      if (deleteError) throw deleteError;

      const { error: updateError } = await supabase
        .from('chat_reports')
        .update({ status: 'actioned' })
        .eq('id', reportId);

      if (updateError) throw updateError;

      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err) {
      console.error('Error deleting message:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const rejectReport = async (reportId: string) => {
    setProcessingId(reportId);
    try {
      const { error } = await supabase
        .from('chat_reports')
        .update({ status: 'rejected' })
        .eq('id', reportId);

      if (error) throw error;

      setReports(prev =>
        prev.map(r =>
          r.id === reportId ? { ...r, report_status: 'rejected' } : r
        )
      );
    } catch (err) {
      console.error('Error rejecting report:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const banUser = async (userId: string, reportId: string) => {
    setProcessingId(reportId);
    try {
      const bannedUntil = new Date();
      bannedUntil.setHours(bannedUntil.getHours() + 24);

      const { error: banError } = await supabase
        .from('chat_bans')
        .insert([
          {
            user_id: userId,
            banned_until: bannedUntil.toISOString(),
            reason: 'حظر من قبل الإدارة',
            banned_by: (await supabase.auth.getSession()).data.session?.user.id,
          },
        ]);

      if (banError) throw banError;

      const { error: updateError } = await supabase
        .from('chat_reports')
        .update({ status: 'actioned' })
        .eq('id', reportId);

      if (updateError) throw updateError;

      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err) {
      console.error('Error banning user:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader className="w-8 h-8 animate-spin text-axie-purple" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-changa font-bold">الرسائل المبلغ عنها</h2>
        <div className="flex gap-2">
          {(['all', 'pending', 'reviewed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg transition-all text-sm font-semibold ${
                filter === f
                  ? 'bg-gradient-to-r from-axie-purple to-axie-pink text-white'
                  : 'bg-white/5 text-axie-purple-light hover:bg-white/10'
              }`}
            >
              {f === 'all' ? 'الكل' : f === 'pending' ? 'قيد الانتظار' : 'تم المراجعة'}
            </button>
          ))}
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <p className="text-axie-purple-light">لا توجد بلاغات</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className="glass-panel p-6 hover:bg-white/10 transition-all">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-axie-purple-light mb-2">
                      المُبلِّغ: <span className="text-white">{report.reported_by_username}</span>
                    </p>
                    <p className="text-sm text-axie-purple-light mb-2">
                      صاحب الرسالة: <span className="text-white">{report.message_author}</span>
                    </p>
                    <p className="text-sm text-axie-purple-light mb-3">
                      السبب: <span className="text-white capitalize">{report.report_reason}</span>
                    </p>

                    <div className="bg-black/20 rounded-lg p-3 mb-3">
                      <p className="text-sm text-gray-300 break-words">
                        {report.message_content}
                      </p>
                    </div>

                    {report.report_details && (
                      <p className="text-xs text-axie-purple-light italic">
                        ملاحظات: {report.report_details}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-lg text-xs">
                    {report.report_status === 'pending' && (
                      <span className="text-yellow-400">قيد الانتظار</span>
                    )}
                    {report.report_status === 'rejected' && (
                      <span className="text-gray-400">مرفوض</span>
                    )}
                    {report.report_status === 'approved' && (
                      <span className="text-green-400">موافق</span>
                    )}
                    {report.report_status === 'actioned' && (
                      <span className="text-blue-400">منفذ</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => deleteMessage(report.message_id, report.id)}
                    disabled={processingId === report.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف الرسالة
                  </button>

                  <button
                    onClick={() => rejectReport(report.id)}
                    disabled={processingId === report.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 rounded-lg text-gray-400 text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    رفض البلاغ
                  </button>

                  <button
                    onClick={() => banUser(report.message_user_id, report.id)}
                    disabled={processingId === report.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 rounded-lg text-orange-400 text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    <Ban className="w-4 h-4" />
                    حظر 24 ساعة
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
