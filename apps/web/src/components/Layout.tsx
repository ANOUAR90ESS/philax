import { Button } from '@philax/ui';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../app/AuthProvider';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        {t('app.skipToContent')}
      </a>
      <header className="site-header">
        <Link to="/" className="brand">
          {t('app.name')}
        </Link>
        <nav aria-label={t('nav.primary')} className="site-nav">
          <NavLink to="/" end>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/challenge">{t('nav.challenge')}</NavLink>
          {user ? <NavLink to="/me">{t('nav.myDebates')}</NavLink> : null}
        </nav>
        <div className="site-header__end">
          <LanguageSwitcher />
          {user ? (
            <Button
              variant="ghost"
              onClick={() => {
                void logout().then(() => navigate('/'));
              }}
            >
              {t('nav.signOut')}
            </Button>
          ) : (
            <Link to="/signin" className="px-btn px-btn--secondary">
              {t('nav.signIn')}
            </Link>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>{t('app.footer')}</p>
        <Link to="/privacy">{t('app.privacyLink')}</Link>
      </footer>
    </div>
  );
}
