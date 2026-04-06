/**
 * Root Application Component
 * D-05: React puro without additional frameworks
 * D-06: useState for local state (Context API for complex state in future phases)
 * D-07: Component structure ready for feature organization
 */
import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';

function MainView() {
  const [response, setResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendTest = async () => {
    setIsLoading(true);
    setResponse('');

    try {
      // D-04: Test IPC by calling window.jarvis.sendText
      const result = await window.jarvis.sendText('teste');

      if (result.success) {
        setResponse(`Success! Received: ${result.data?.received}`);
      } else {
        setResponse(`Error: ${result.error}`);
      }
    } catch (err) {
      setResponse(`Exception: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-heading font-semibold mb-4">JARVIS Desktop</h1>

      <p className="text-label text-gray-400 mb-8">
        Phase 9 Scaffold - IPC Test
      </p>

      <button
        onClick={handleSendTest}
        disabled={isLoading}
        className="px-6 py-3 bg-orb-idle text-white rounded-lg font-medium
                   hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        {isLoading ? 'Sending...' : 'Test IPC: sendText("teste")'}
      </button>

      {response && (
        <div className="mt-6 p-4 bg-glass-bg border border-glass-border rounded-glass">
          <p className="text-body font-mono">{response}</p>
        </div>
      )}

      <p className="mt-8 text-label text-gray-500">
        Check terminal for "[IPC:chat:send-text] Received message: teste"
      </p>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainView />} />
      {/* D-07: Future routes for settings, etc. */}
    </Routes>
  );
}

export default App;
