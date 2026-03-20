import { Component, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import HomePage from "./pages/HomePage";
import ResearchPage from "./pages/ResearchPage";
import InterviewPage from "./pages/InterviewPage";
import AnalysisPage from "./pages/AnalysisPage";
import AdaptabilityInterviewPage from "./pages/AdaptabilityInterviewPage";
import AdaptabilityProfilePage from "./pages/AdaptabilityProfilePage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminSessionsPage from "./pages/AdminSessionsPage";
import AdminAssessmentsPage from "./pages/AdminAssessmentsPage";
import AssessmentBuilderPage from "./pages/AssessmentBuilderPage";
import AdminPreviewPage from "./pages/AdminPreviewPage";
import AdminCompaniesPage from "./pages/AdminCompaniesPage";
import AdminCompanyDetailPage from "./pages/AdminCompanyDetailPage";
import AdminInvitationsPage from "./pages/AdminInvitationsPage";

// Lazy-loaded v1 feature pages
const AdminCampaignsPage = lazy(() => import("./pages/AdminCampaignsPage"));
const AdminCampaignDetailPage = lazy(() => import("./pages/AdminCampaignDetailPage"));
const AdminContactsPage = lazy(() => import("./pages/AdminContactsPage"));
const AdminCallsPage = lazy(() => import("./pages/AdminCallsPage"));
const AdminWebhooksPage = lazy(() => import("./pages/AdminWebhooksPage"));
const AdminSearchPage = lazy(() => import("./pages/AdminSearchPage"));
const AdminAnalyticsPage = lazy(() => import("./pages/AdminAnalyticsPage"));
const AdminSettingsPage = lazy(() => import("./pages/AdminSettingsPage"));
const ResumePage = lazy(() => import("./pages/ResumePage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  );
}


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
            <h1 className="text-xl font-semibold text-foreground/90">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">An error occurred in the admin panel.</p>
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
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/research/:sessionId" element={<ResearchPage />} />
        <Route path="/interview/:sessionId" element={<InterviewPage />} />
        <Route path="/analysis/:sessionId" element={<AnalysisPage />} />
        <Route path="/adaptability-interview/:sessionId" element={<AdaptabilityInterviewPage />} />
        <Route path="/adaptability-profile/:sessionId" element={<AdaptabilityProfilePage />} />
        <Route path="/resume/:token" element={<Suspense fallback={<LazyFallback />}><ResumePage /></Suspense>} />
        <Route path="/compare" element={<Suspense fallback={<LazyFallback />}><ComparePage /></Suspense>} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route element={<AdminErrorBoundary><AdminLayout /></AdminErrorBoundary>}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/sessions" element={<AdminSessionsPage />} />
          <Route path="/admin/invitations" element={<AdminInvitationsPage />} />
          <Route path="/admin/assessments" element={<AdminAssessmentsPage />} />
          <Route path="/admin/companies" element={<AdminCompaniesPage />} />
          <Route path="/admin/companies/:company" element={<AdminCompanyDetailPage />} />
          <Route path="/admin/builder" element={<AssessmentBuilderPage />} />
          <Route path="/admin/builder/:id" element={<AssessmentBuilderPage />} />
          <Route path="/admin/preview/:assessmentId" element={<AdminPreviewPage />} />
          <Route path="/admin/campaigns" element={<Suspense fallback={<LazyFallback />}><AdminCampaignsPage /></Suspense>} />
          <Route path="/admin/campaigns/:id" element={<Suspense fallback={<LazyFallback />}><AdminCampaignDetailPage /></Suspense>} />
          <Route path="/admin/contacts" element={<Suspense fallback={<LazyFallback />}><AdminContactsPage /></Suspense>} />
          <Route path="/admin/calls" element={<Suspense fallback={<LazyFallback />}><AdminCallsPage /></Suspense>} />
          <Route path="/admin/webhooks" element={<Suspense fallback={<LazyFallback />}><AdminWebhooksPage /></Suspense>} />
          <Route path="/admin/search" element={<Suspense fallback={<LazyFallback />}><AdminSearchPage /></Suspense>} />
          <Route path="/admin/analytics" element={<Suspense fallback={<LazyFallback />}><AdminAnalyticsPage /></Suspense>} />
          <Route path="/admin/settings" element={<Suspense fallback={<LazyFallback />}><AdminSettingsPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}
