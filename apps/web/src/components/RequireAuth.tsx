import { Spinner } from '@philax/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (loading) return <Spinner label={t('debate.generating')} />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
