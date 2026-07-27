import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
  /** Optional page-level header — rendered as sticky, full-width within the main area */
  header?: ReactNode;
}

export function AppShell({ children, header }: AppShellProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const marginClass = collapsed ? 'md:pl-16' : 'md:pl-60';

  return (
    <div className="min-h-dvh bg-page">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      {/* Mobile hamburger button */}
      <div className="fixed left-4 top-4 z-40 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex cursor-pointer items-center justify-center rounded-xl bg-white p-2.5 shadow-md border border-gray-200 text-foreground hover:bg-gray-50 transition-colors"
          aria-label="Открыть меню"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <main
        className={`min-h-screen pl-0 pt-16 ${marginClass}`}
      >
        {header && (
          <div className="sticky top-0 z-30">
            {header}
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}