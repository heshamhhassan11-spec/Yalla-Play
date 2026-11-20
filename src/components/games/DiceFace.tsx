import React from 'react';

interface DiceFaceProps {
  value: number | null;
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;
}

const PIP_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 25],
    [72, 25],
    [28, 50],
    [72, 50],
    [28, 75],
    [72, 75],
  ],
};

export const DiceFace: React.FC<DiceFaceProps> = ({
  value,
  size = 'md',
  highlight = false,
}) => {
  const dim =
    size === 'sm' ? 'w-12 h-12 rounded-xl' : size === 'lg' ? 'w-20 h-20 rounded-2xl' : 'w-16 h-16 rounded-2xl';
  const pips = value && value >= 1 && value <= 6 ? PIP_POSITIONS[value] : null;

  return (
    <div
      className={`${dim} mx-auto flex items-center justify-center border-2 transition-all shadow-sm ${
        highlight
          ? 'bg-amber-50 dark:bg-slate-800 border-amber-400 dark:border-amber-500 ring-4 ring-amber-400/20'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
      }`}
    >
      {pips ? (
        <svg viewBox="0 0 100 100" className="w-full h-full p-1.5">
          <rect
            x="6"
            y="6"
            width="88"
            height="88"
            rx="18"
            className="fill-white dark:fill-slate-800 stroke-slate-200 dark:stroke-slate-700"
            strokeWidth="3"
          />
          {pips.map(([cx, cy], idx) => (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={value === 1 ? 12 : 9.5}
              className={
                value === 1 || value === 6
                  ? 'fill-rose-600 dark:fill-rose-400'
                  : 'fill-[#141824] dark:fill-white'
              }
            />
          ))}
        </svg>
      ) : (
        <span className="text-xl font-extrabold font-mono-num text-slate-300 dark:text-slate-600">
          —
        </span>
      )}
    </div>
  );
};
