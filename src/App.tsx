import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ResearchPage from "./pages/ResearchPage";
import InterviewPage from "./pages/InterviewPage";
import AnalysisPage from "./pages/AnalysisPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminChatPage from "./pages/AdminChatPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/research/:sessionId" element={<ResearchPage />} />
        <Route path="/interview/:sessionId" element={<InterviewPage />} />
        <Route path="/analysis/:sessionId" element={<AnalysisPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/admin/chat" element={<AdminChatPage />} />
      </Routes>
    </BrowserRouter>
  );
}
