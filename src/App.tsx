import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Dashboard } from "@/pages/Dashboard"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AppToastProvider } from "@/contexts/ToastContext"
import { ThemeProvider } from "@/contexts/ThemeContext"

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppToastProvider>
          <Router>
            <Routes>
              <Route path="/" element={<Dashboard />} />
            </Routes>
          </Router>
        </AppToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
