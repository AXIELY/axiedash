/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy names — keep so existing game components don't break
        'axie-purple': {
          DEFAULT: '#8b5cf6',
          dark: '#1e1040',
          darker: '#0d0820',
          light: '#a78bfa',
        },
        'axie-gold': {
          DEFAULT: '#D6B47B',
          light: '#E7C38F',
          dark: '#C6A06A',
        },
        'axie-blue': {
          DEFAULT: '#00e5ff',
          dark: '#0066ff',
        },
        'axie-pink': '#e879f9',
        // Premium dark palette
        'lux': {
          '50':  '#FDFBF7',
          '100': '#F5EDD9',
          '200': '#E7C38F',
          '300': '#D6B47B',
          '400': '#C6A06A',
          '500': '#B48C57',
          '600': '#9A7444',
          '700': '#7C5C33',
          bg:       '#070707',
          'bg-2':   '#0B0B0B',
          'bg-3':   '#101010',
          'bg-4':   '#121212',
          card:     '#141414',
          'card-2': '#181818',
          border:   'rgba(255,255,255,0.06)',
        },
        'game': {
          bg:      '#070707',
          surface: '#141414',
          card:    '#181818',
          border:  'rgba(255,255,255,0.06)',
          accent:  '#D6B47B',
          gold:    '#D6B47B',
        },
      },
      fontFamily: {
        cairo:   ['Cairo', 'sans-serif'],
        inter:   ['Inter', 'sans-serif'],
        tajawal: ['Tajawal', 'sans-serif'],
        changa:  ['Changa', 'sans-serif'],
        sans:    ['Cairo', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'lux-bg':       'linear-gradient(180deg, #070707 0%, #0B0B0B 100%)',
        'card-surface': 'linear-gradient(145deg, #181818 0%, #141414 100%)',
        'gold-grad':    'linear-gradient(135deg, #C6A06A 0%, #D6B47B 50%, #E7C38F 100%)',
        'gold-subtle':  'linear-gradient(135deg, rgba(214,180,123,0.12) 0%, rgba(214,180,123,0.04) 100%)',
        // Keep legacy gradients for game components
        'game-bg':      'linear-gradient(135deg, #070707 0%, #0B0B0B 100%)',
        'sidebar-bg':   'linear-gradient(180deg, #0B0B0B 0%, #070707 100%)',
        'accent-grad':  'linear-gradient(135deg, #C6A06A 0%, #E7C38F 100%)',
        'cyan-grad':    'linear-gradient(135deg, #06b6d4 0%, #00e5ff 100%)',
      },
      animation: {
        'fade-in':     'fade-in 0.35s ease-out both',
        'fade-up':     'fade-up 0.4s ease-out both',
        'slide-up':    'slide-up 0.4s ease-out',
        'scale-in':    'scale-in 0.3s ease-out',
        'shake':       'shake 0.5s ease-in-out',
        'float':       'float 3s ease-in-out infinite',
        'pulse-glow':  'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse':  'glow-pulse 2.5s ease-in-out infinite',
        'slide-right': 'slide-right 0.3s ease-out',
        'slide-left':  'slide-left 0.3s ease-out',
        'spin-slow':   'spin 3s linear infinite',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%':   { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%':       { transform: 'translateX(-8px)' },
          '75%':       { transform: 'translateX(8px)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-8px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.7' },
        },
        'glow-pulse': {
          '0%, 100%': { 'box-shadow': '0 0 12px rgba(214,180,123,0.2)' },
          '50%':       { 'box-shadow': '0 0 24px rgba(214,180,123,0.4)' },
        },
        'slide-right': {
          '0%':   { transform: 'translateX(-16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-left': {
          '0%':   { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'lux':       '0 4px 20px rgba(0,0,0,0.18)',
        'lux-lg':    '0 8px 32px rgba(0,0,0,0.28)',
        'lux-xl':    '0 16px 48px rgba(0,0,0,0.36)',
        'gold':      '0 4px 20px rgba(214,180,123,0.15)',
        'gold-lg':   '0 8px 32px rgba(214,180,123,0.22)',
        'inner':     'inset 0 1px 0 rgba(255,255,255,0.05)',
        // Legacy
        'game':      '0 4px 24px rgba(0,0,0,0.4)',
        'neon-gold': '0 0 20px rgba(214,180,123,0.3)',
      },
      borderRadius: {
        'xl2': '20px',
        'xl3': '24px',
        'xl4': '32px',
      },
    },
  },
  plugins: [],
};
