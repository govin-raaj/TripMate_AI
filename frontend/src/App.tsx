import { useTravelPlanner } from './hooks/useTravelPlanner.ts';
import { ChatWindow } from './components/ChatWindow.tsx';

function App() {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    approvePlan
  } = useTravelPlanner();

  return (
    <div className="app-shell relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-8rem] h-80 w-80 rounded-full bg-teal-400/18 blur-3xl" />
        <div className="absolute right-[-6rem] top-24 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/8 bg-navy-950/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-teal-400 to-cyan-500 font-display text-lg text-navy-950 shadow-lg shadow-teal-500/20">
              TM
            </div>
            <div>
              <h1 className="font-display text-xl text-white sm:text-2xl">TripMate AI</h1>
              <p className="text-xs text-slate-400 sm:text-sm">Your private travel studio</p>
            </div>
          </div>
          <p className="hidden max-w-xs text-right text-xs text-slate-400 sm:block">
            Intelligent itineraries with flights, hotels, weather, and a budget you can actually use.
          </p>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6">
        <div className="h-full min-h-0 w-full flex-1">
          <ChatWindow
            messages={messages}
            onSendMessage={sendMessage}
            onApprove={approvePlan}
            isLoading={isLoading}
            error={error}
          />
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/8 py-3">
        <p className="text-center text-xs text-slate-500">
          TripMate AI · Plans are drafts until you approve them
        </p>
      </footer>
    </div>
  );
}

export default App;
