import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  LineChart,
  Crosshair,
  BookOpen,
  CalendarDays,
  Settings,
  Zap,
} from 'lucide-react';

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/analysis', icon: LineChart, label: 'Analysis' },
  { path: '/trade', icon: Crosshair, label: 'Trade' },
  { path: '/journal', icon: BookOpen, label: 'Journal' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-16 bg-ict-dark-bg/80 backdrop-blur-xl border-r border-ict-border/30 flex flex-col items-center z-50">
      {/* Logo */}
      <div className="w-full flex items-center justify-center h-14 border-b border-ict-border/20">
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="relative"
        >
          <Zap
            size={24}
            className="text-ict-accent"
            fill="currentColor"
            strokeWidth={0}
          />
          <div className="absolute inset-0 blur-md bg-ict-accent/30 rounded-full" />
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-1 py-4 w-full px-2">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className="w-full"
            >
              {({ isActive }) => (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    relative w-full aspect-square rounded-xl flex items-center justify-center
                    transition-all duration-200 group
                    ${
                      isActive
                        ? 'text-ict-accent'
                        : 'text-ict-muted hover:text-ict-text'
                    }
                  `}
                >
                  {/* Active indicator background */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl bg-ict-accent/10 border border-ict-accent/20"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}

                  {/* Active left bar */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-bar"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-ict-accent rounded-r-full"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}

                  <Icon size={20} className="relative z-10" />

                  {/* Tooltip on hover */}
                  <div
                    className="
                      absolute left-full ml-3 px-2.5 py-1.5
                      bg-ict-card border border-ict-border/50 rounded-lg
                      text-xs font-medium text-ict-text whitespace-nowrap
                      opacity-0 scale-95 pointer-events-none
                      group-hover:opacity-100 group-hover:scale-100
                      transition-all duration-150 z-50
                      shadow-lg
                    "
                  >
                    {item.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-ict-card" />
                  </div>
                </motion.div>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="pb-4 px-2 w-full">
        <div className="w-full aspect-square rounded-xl flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ict-accent/30 to-ict-accent/5 border border-ict-accent/20 flex items-center justify-center">
            <span className="text-xs font-bold text-ict-accent">A</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
