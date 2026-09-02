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
    <div className="min-h-screen w-full bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-sm bg-white/80 border-b border-gray-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
              ✈️ TripMate AI
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              Plan your next adventure with our intelligent Multi-Agent Travel Assistant
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-3xl mx-auto">
          <ChatWindow
            messages={messages}
            onSendMessage={sendMessage}
            onApprove={approvePlan}
            isLoading={isLoading}
            error={error}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/50 bg-white/40 backdrop-blur-sm py-4">
        <p className="text-center text-xs sm:text-sm text-gray-500">
          Powered by TripMate AI • Your intelligent travel companion
        </p>
      </footer>
    </div>
  );
}

export default App;
