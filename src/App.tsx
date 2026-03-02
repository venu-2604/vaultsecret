import { useEffect, useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import ChatRoom from "./pages/ChatRoom";
import NotFound from "./pages/NotFound";
import VSLoader from "./components/VSLoader";

const queryClient = new QueryClient();

const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

const App = () => {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState(false);

  const ensureAnonymousAuth = useCallback(async (attempt = 0) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
        return;
      }
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      setReady(true);
    } catch (err) {
      console.error(`Auth attempt ${attempt + 1} failed:`, err);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        return ensureAnonymousAuth(attempt + 1);
      }
      setAuthError(true);
      setReady(true); // unblock UI so user sees error
    }
  }, []);

  useEffect(() => {
    ensureAnonymousAuth();
  }, [ensureAnonymousAuth]);

  if (!ready) return <VSLoader />;

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <p className="text-destructive font-medium">Connection failed. Please check your network and try again.</p>
          <button
            onClick={() => { setAuthError(false); setReady(false); ensureAnonymousAuth(); }}
            className="px-6 py-2.5 rounded-xl gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/chat/:roomId" element={<ChatRoom />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
