import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useSocket } from '@/hooks/useSocket';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  // Initialize socket connection
  useSocket();

  return (
    <div className="flex h-screen w-screen bg-ict-bg overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col ml-16">
        {/* Top bar */}
        <TopBar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          <div className="max-w-[1920px] mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Background ambient effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-ict-accent/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/[0.02] rounded-full blur-[120px]" />
      </div>
    </div>
  );
}
