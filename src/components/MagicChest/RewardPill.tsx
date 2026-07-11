import { rewardIconMap, rewardColorMap, ThemeConfig } from '../../config/magicChestConfig';
import { MagicChestReward } from '../../hooks/useMagicChest';

interface RewardPillProps {
  reward: MagicChestReward;
  theme: ThemeConfig;
}

export const RewardPill = ({ reward, theme }: RewardPillProps) => {
  const icon = rewardIconMap[reward.icon] || '🎁';
  const color = rewardColorMap[reward.color] || theme.primary;

  return (
    <div
      className="flex items-center gap-2 rounded-[12px] px-3 py-2 flex-shrink-0 transition-all duration-200 cursor-default"
      style={{
        background: `${color}0D`,
        border: `1px solid ${color}26`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 12px ${color}40`;
        e.currentTarget.style.borderColor = `${color}4D`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = `${color}26`;
      }}
    >
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold truncate" style={{ color: 'var(--text-1)' }}>{reward.name}</p>
        <p className="text-[11px] font-mono" style={{ color }}>{reward.value}</p>
      </div>
    </div>
  );
};
