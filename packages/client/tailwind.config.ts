import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ict: {
          bg: '#0A0A0F',
          card: '#1A1A2E',
          'card-hover': '#222240',
          bullish: '#00C853',
          bearish: '#FF1744',
          neutral: '#FFD600',
          accent: '#00BCD4',
          text: '#E0E0E0',
          muted: '#6B7280',
          border: '#2A2A4A',
          'dark-bg': '#050508',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass-gradient':
          'linear-gradient(135deg, rgba(26, 26, 46, 0.8), rgba(26, 26, 46, 0.4))',
      },
      boxShadow: {
        glow: '0 0 20px rgba(0, 188, 212, 0.15)',
        'glow-bullish': '0 0 20px rgba(0, 200, 83, 0.15)',
        'glow-bearish': '0 0 20px rgba(255, 23, 68, 0.15)',
        card: '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 188, 212, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(0, 188, 212, 0.4)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
