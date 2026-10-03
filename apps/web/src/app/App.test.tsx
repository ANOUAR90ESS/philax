import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n, setLocale } from '../lib/i18n';
import { AppRoutes } from './App';
import { AuthProvider } from './AuthProvider';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'x', errorId: 'e' } }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        ),
    ),
  );
});

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('App', () => {
  it('renders the home screen with an accessible input and skip link', async () => {
    initI18n('en');
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'What do you want to examine?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Paste a link or write an idea' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start debate' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('switches to Arabic with RTL direction', async () => {
    initI18n('en');
    await setLocale('ar');
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'ما الذي تريد فحصه؟' }),
    ).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    await setLocale('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
