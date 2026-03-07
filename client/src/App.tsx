import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TeamProvider } from "./contexts/TeamContext";
import Home from "./pages/Home";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TeamProvider>
          <TooltipProvider>
            <Toaster position="top-center" />
            <Home />
          </TooltipProvider>
        </TeamProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
