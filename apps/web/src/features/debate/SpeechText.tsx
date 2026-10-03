import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { citationAnchor } from '../sources/SourceList';

const MARKER = /\[(E\d+(?:\s*,\s*E\d+)*)\]/g;

/** Renders a speech with citation markers as links to the turn's source list. */
export function SpeechText({ text, scope, lang }: { text: string; scope: string; lang?: string }) {
  const { t } = useTranslation();
  const parts: (string | string[])[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    parts.push(text.slice(last, m.index));
    parts.push((m[1] ?? '').split(',').map((l) => l.trim()));
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return (
    <p className="speech" dir="auto" lang={lang}>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <sup key={i} className="cite-marks">
            {p.map((label) => (
              <a
                key={label}
                href={`#${citationAnchor(scope, label)}`}
                className="cite-mark"
                aria-label={t('debate.jumpToSource', { label })}
                onClick={(e) => {
                  // Sources live in a collapsible panel: open it before moving focus there.
                  const target = document.getElementById(citationAnchor(scope, label));
                  if (!target) return;
                  e.preventDefault();
                  target.closest('details')?.setAttribute('open', '');
                  target.focus();
                }}
              >
                {label}
              </a>
            ))}
          </sup>
        ),
      )}
    </p>
  );
}
