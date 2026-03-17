import './globals.css';
import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';

export const metadata: Metadata = {
  title: 'LLS Scoreboard',
  description: 'LLS sales scoreboard web dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
