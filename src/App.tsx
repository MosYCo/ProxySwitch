import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Dashboard } from "@/pages/Dashboard"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AppToastProvider } from "@/contexts/ToastContext"

function App() {
  return (
    <ErrorBoundary>
      <AppToastProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Dashboard />} />
          </Routes>
        </Router>
      </AppToastProvider>
    </ErrorBoundary>
  )
}

export default App
