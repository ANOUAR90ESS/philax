import type { DebateListItem } from '@philax/types';
import { Button, Spinner } from '@philax/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { debatesApi } from '../api/debates';
import { useAuth } from '../app/AuthProvider';
import { ErrorMessage } from '../components/ErrorMessage';

function DebateList({ items, onDelete }: { items: DebateListItem[]; onDelete(id: string): void }) {
  const { t, i18n } = useTranslation();
  if (!items.length) return <p className="px-muted">{t('profile.empty')}</p>;
  return (
    <ul className="debate-list" role="list">
      {items.map((d) => (
        <li key={d.id} className="debate-list__item">
          <div>
            <Link to={`/debates/${d.id}`} className="debate-list__title">
              {d.title}
            </Link>
            <p className="px-m0 px-small px-muted">
              {t(`debate.phases.${d.phase}`)} ·{' '}
              {new Date(d.createdAt).toLocaleDateString(i18n.language)}
              {d.mode === 'challenge' ? ` · ${t('nav.challenge')}` : ''}
              {d.saved ? ` · ${t('profile.savedBadge')}` : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => onDelete(d.id)}
            aria-label={`${t('profile.delete')}: ${d.title}`}
          >
            {t('profile.delete')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function MyDebatesPage() {
  const { t } = useTranslation();
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<DebateListItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    debatesApi
      .list()
      .then((r) => setItems(r.debates))
      .catch(setError);
  }, []);

  async function onDelete(id: string) {
    if (!window.confirm(t('debate.deleteConfirm'))) return;
    try {
      await debatesApi.remove(id);
      setItems((xs) => (xs ? xs.filter((x) => x.id !== id) : xs));
    } catch (err) {
      setError(err);
    }
  }

  async function onDeleteAccount() {
    if (!window.confirm(t('profile.deleteAccountConfirm'))) return;
    await deleteAccount();
    navigate('/');
  }

  return (
    <div className="stack-lg narrow-wide">
      <h1>{t('profile.title')}</h1>
      {error ? <ErrorMessage error={error} /> : null}
      {!items ? (
        <Spinner label={t('debate.loading')} />
      ) : (
        <>
          <section aria-labelledby="saved-title" className="stack">
            <h2 id="saved-title">{t('profile.saved')}</h2>
            <DebateList items={items.filter((d) => d.saved)} onDelete={onDelete} />
          </section>
          <section aria-labelledby="all-title" className="stack">
            <h2 id="all-title">{t('profile.all')}</h2>
            <DebateList items={items} onDelete={onDelete} />
          </section>
        </>
      )}
      <section aria-labelledby="account-title" className="stack">
        <h2 id="account-title">{t('profile.account')}</h2>
        <div>
          <Button variant="danger" onClick={() => void onDeleteAccount()}>
            {t('profile.deleteAccount')}
          </Button>
        </div>
      </section>
    </div>
  );
}
