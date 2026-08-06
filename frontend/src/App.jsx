import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './components/layout/DashboardLayout'
import LandingPage from './pages/landing/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import MembershipPage from './pages/membership/MembershipPage'
import AdvertisePage from './pages/membership/AdvertisePage'
import RolesPage from './pages/dashboard/RolesPage'
import SubscriptionPage from './pages/dashboard/SubscriptionPage'
import ResumePage from './pages/Resume/ResumePage'
import PerformancePage from './pages/Reports/PerformancePage'
import QuickReportPage from './pages/Reports/QuickReportPage'
import QuickPracticePage from './pages/Practice/QuickPracticePage'
import PracticeModePage from './pages/Practice/PracticeModePage'
import CompanyPrepPage from './pages/CompanyPrep/CompanyPrepPage'
import CompanyTopicsPage from './pages/CompanyPrep/CompanyTopicsPage'
import CompanyQuestionsPage from './pages/CompanyPrep/CompanyQuestionsPage'
import AchievementsPage from './pages/Achievements/AchievementsPage'
import SettingsPage from './pages/Settings/SettingsPage'
import RoadmapPage from './pages/Roadmap/RoadmapPage'
import PaymentPage from './pages/payment/PaymentPage'
import InterviewPage from './pages/interview/InterviewPage'
import CompanyInterviewPage from './pages/interview/CompanyInterviewPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/membership" element={<MembershipPage />} />
      <Route path="/advertise" element={<AdvertisePage />} />

      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={null} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="reports" element={<PerformancePage />} />
        <Route path="practice" element={<QuickPracticePage />} />
        <Route path="practice/:mode" element={<PracticeModePage />} />
        <Route path="company-prep" element={<CompanyPrepPage />} />
        <Route path="company-prep/:company" element={<CompanyTopicsPage />} />
        <Route path="company-prep/:company/questions" element={<CompanyQuestionsPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="roadmap" element={<RoadmapPage />} />
        <Route path="payment" element={<PaymentPage />} />
      </Route>

      <Route path="/interview" element={<InterviewPage />} />
      <Route path="/interview/company/:company" element={<CompanyInterviewPage />} />
      <Route path="/reports/quick" element={<QuickReportPage />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
