import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const ParallaxStudio = lazy(() => import("./pages/ParallaxStudio"));
const ClassicStudio = lazy(() => import("./pages/Index"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Suspense fallback={<div className="min-h-screen bg-background text-foreground grid place-items-center">Loading Parallax Studio...</div>}>
                <ParallaxStudio />
              </Suspense>
            }
          />
          <Route
            path="/parallax-studio"
            element={
              <Suspense fallback={<div className="min-h-screen bg-background text-foreground grid place-items-center">Loading Parallax Studio...</div>}>
                <ParallaxStudio />
              </Suspense>
            }
          />
          <Route
            path="/classic-studio"
            element={
              <Suspense fallback={<div className="min-h-screen bg-background text-foreground grid place-items-center">Loading Classic Studio...</div>}>
                <ClassicStudio />
              </Suspense>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
