'use client';

import ErrorBoundary from './components/ErrorBoundary';
import TicketPanel from './components/TicketPanel';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-shire font-bold text-amber-400">
            🎫 Ticket Tracker
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            ShireWorks ticket management —{' '}
            <a
              href="https://github.com/shireworks/tickets-app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-300"
            >
              tickets-app
            </a>
          </p>
        </div>

        <ErrorBoundary name="TicketPanel">
          <TicketPanel />
        </ErrorBoundary>
      </main>
    </div>
  );
}
