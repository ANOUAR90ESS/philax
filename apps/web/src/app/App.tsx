import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ChallengePage } from '../routes/ChallengePage';
import { HomePage } from '../routes/HomePage';
import { NotFoundPage } from '../routes/NotFoundPage';
import { PrivacyPage } from '../routes/PrivacyPage';
import { RegisterPage } from '../routes/RegisterPage';
import { SignInPage } from '../routes/SignInPage';
import { AuthProvider } from './AuthProvider';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="challenge" element={<ChallengePage />} />
        <Route path="signin" element={<SignInPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
