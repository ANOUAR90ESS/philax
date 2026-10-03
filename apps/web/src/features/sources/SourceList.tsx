import type { Citation } from '@philax/types';
import { useTranslation } from 'react-i18next';

export function citationAnchor(scope: string, label: string): string {
  return `cite-${scope}-${label}`;
}

/** Sources behind a turn or synthesis. Never shows a link that is not stored (§58). */
export function SourceList({
  citations,
  scope,
  onOpen,
}: {
  citations: Citation[];
  scope: string;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  if (citations.length === 0) return <p className="px-muted px-small px-m0">{t('sources.none')}</p>;
  return (
    <ol className="source-list">
      {citations.map((c) => (
        <li
          key={c.evidenceId}
          id={citationAnchor(scope, c.evidenceId)}
          className="source-item"
          tabIndex={-1}
        >
          <span className="source-item__label" aria-hidden="true">
            {c.evidenceId}
          </span>
          <div className="source-item__body">
            <p className="px-m0" dir="auto">
              {c.author ? <span>{c.author}, </span> : null}
              <cite>{c.sourceTitle}</cite>
              {c.locator ? (
                <span className="px-muted"> — {t('sources.locator', { locator: c.locator })}</span>
              ) : null}
            </p>
            <p className="px-m0 px-small px-muted">
              {t(`sources.kinds.${c.knowledgeKind}`)} · {t(`sources.types.${c.sourceType}`)}
              {c.knowledgeKind !== 'user_content' ? ` · ${t('sources.paraphrase')}` : null}
            </p>
            {c.url ? (
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="px-small"
                onClick={onOpen}
              >
                {t('sources.open')}
              </a>
            ) : c.sourceType !== 'user-provided' ? (
              <p className="px-m0 px-small px-muted">{t('sources.noUrl')}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
