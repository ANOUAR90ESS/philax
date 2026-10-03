import { Button, TextField } from '@philax/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { ErrorMessage } from '../../components/ErrorMessage';
import { isLocale } from '../../lib/i18n';

export function AuthForm({ mode }: { mode: 'signin' | 'register' }) {
  const { t, i18n } = useTranslation();
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await login({ email, password });
      else
        await register({
          email,
          password,
          displayName: displayName.trim() || undefined,
          locale: isLocale(i18n.language) ? i18n.language : 'en',
        });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'signin' ? t('auth.signInTitle') : t('auth.registerTitle');
  return (
    <section className="narrow stack" aria-labelledby="auth-title">
      <h1 id="auth-title">{title}</h1>
      <p className="px-muted">{t('auth.required')}</p>
      <form className="stack" onSubmit={onSubmit} noValidate>
        {mode === 'register' ? (
          <TextField
            label={t('auth.displayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            maxLength={80}
          />
        ) : null}
        <TextField
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <TextField
          label={t('auth.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          hint={mode === 'register' ? t('auth.passwordHint') : undefined}
          minLength={mode === 'register' ? 10 : undefined}
          required
        />
        {error ? <ErrorMessage error={error} /> : null}
        <Button type="submit" busy={busy}>
          {mode === 'signin' ? t('auth.submitSignIn') : t('auth.submitRegister')}
        </Button>
      </form>
      <p>
        {mode === 'signin' ? (
          <Link to="/register" state={location.state}>
            {t('auth.toRegister')}
          </Link>
        ) : (
          <Link to="/signin" state={location.state}>
            {t('auth.toSignIn')}
          </Link>
        )}
      </p>
    </section>
  );
}
