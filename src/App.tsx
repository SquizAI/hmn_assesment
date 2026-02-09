import { Component } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ResearchPage from "./pages/ResearchPage";
import InterviewPage from "./pages/InterviewPage";
import AnalysisPage from "./pages/AnalysisPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminSessionsPage from "./pages/AdminSessionsPage";
import AdminAssessmentsPage from "./pages/AdminAssessmentsPage";
import AdminChatPage from "./pages/AdminChatPage";


class AdminErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-xl font-semibold text-white/80">Something went wrong</h1>
            <p className="text-white/40 text-sm">An error occurred in the admin panel.</p>
            <a href="/admin/dashboard" className="text-blue-400 hover:text-blue-300 text-sm">Return to Dashboard</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/research/:sessionId" element={<ResearchPage />} />
        <Route path="/interview/:sessionId" element={<InterviewPage />} />
        <Route path="/analysis/:sessionId" element={<AnalysisPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route element={<AdminErrorBoundary><AdminLayout /></AdminErrorBoundary>}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/sessions" element={<AdminSessionsPage />} />
          <Route path="/admin/assessments" element={<AdminAssessmentsPage />} />
          <Route path="/admin/chat" element={<AdminChatPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
