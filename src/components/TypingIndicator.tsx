interface TypingUser {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export const TypingIndicator = ({ typingUsers }: { typingUsers: TypingUser[] }) => {
  if (typingUsers.length === 0) return null;

  const getTypingText = () => {
    if (typingUsers.length === 1) return `${typingUsers[0].username} يكتب`;
    if (typingUsers.length === 2) return `${typingUsers[0].username} و ${typingUsers[1].username} يكتبان`;
    return 'عدة مستخدمين يكتبون';
  };

  return (
    <div className="px-4 py-2 flex items-center gap-2 text-xs animate-fade-in" style={{ color: 'rgba(255,255,255,0.35)' }}>
      <div className="flex items-center gap-0.5">
        {[0, 0.15, 0.3].map((delay, i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#8b5cf6', animationDelay: `${delay}s`, boxShadow: '0 0 4px rgba(139,92,246,0.6)' }} />
        ))}
      </div>
      <span className="italic">{getTypingText()}...</span>
    </div>
  );
};
