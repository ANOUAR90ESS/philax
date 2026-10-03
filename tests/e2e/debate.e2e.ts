import { expect, test, type Page } from '@playwright/test';

async function registerAndStart(page: Page, topic: string) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Paste a link or write an idea' }).fill(topic);
  await page.getByRole('button', { name: 'Start debate' }).click();
  // Not signed in: redirected to sign-in, draft preserved across registration.
  await page.getByRole('link', { name: 'New here? Create an account' }).click();
  await page
    .getByLabel('Email')
    .fill(`e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@test.dev`);
  await page.getByLabel('Password').fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  // Registration returns to the home page with the draft restored.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('textbox', { name: 'Paste a link or write an idea' })).toHaveValue(
    topic,
  );
  await page.getByRole('button', { name: 'Start debate' }).click();
}

test('core scenario: topic → characters → rounds → user joins → synthesis', async ({ page }) => {
  await registerAndStart(page, 'Will artificial intelligence make people less creative?');

  // Preparation runs automatically and the cast appears.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Will AI make people less creative?',
    { timeout: 30_000 },
  );
  const participants = page
    .getByRole('complementary', { name: 'Participants' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(participants.first()).toBeVisible();
  expect(await participants.count()).toBeGreaterThanOrEqual(3);
  await expect(
    page.getByText(/simulated reconstruction based on documented works/i).first(),
  ).toBeVisible();

  // Round 1: opening positions with cited sources.
  await page.getByRole('button', { name: 'Begin the debate' }).click();
  await expect(page.getByRole('heading', { name: /Opening positions/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next round' })).toBeVisible({ timeout: 30_000 });

  // The cast appears on the stage; each turn is presented with the speaker in focus,
  // subtitles, an AI-reconstruction notice and the others listening.
  const stage = page.getByRole('region', { name: 'Debate stage' });
  await expect(stage.getByRole('listitem')).toHaveCount(await participants.count());
  await expect(stage.getByText('Now speaking:')).toBeVisible({ timeout: 30_000 });
  await expect(
    stage.getByRole('img', { name: /^Portrait of .+ \(AI reconstruction\)$/ }),
  ).toBeVisible();
  await expect(stage.getByText(/they are not historical images or recordings/)).toBeVisible();
  await expect(stage.getByText('Listening').first()).toBeVisible();
  // No provider keys in this environment: the app says so instead of faking an avatar or voice.
  await expect(stage.getByText('Provider status: NOT CONFIGURED')).toBeVisible();
  await expect(stage.getByText(/^Voice unavailable: /)).toBeVisible();
  await expect(stage.locator('video')).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await stage.getByRole('button', { name: 'Skip' }).click();

  const firstMessage = page.getByRole('article').first();
  await expect(firstMessage.getByText(/Sources cited/)).toBeVisible();
  const marker = firstMessage.getByRole('link', { name: /^Source E\d+$/ }).first();
  const label = ((await marker.textContent()) ?? '').trim();
  await marker.click();
  // The citation opens the turn's source list and moves focus to that exact source.
  const source = firstMessage.locator('li.source-item').filter({ hasText: label }).first();
  await expect(source).toBeVisible();
  await expect(source).toBeFocused();

  // The user enters the debate and participants respond, challenge and reframe.
  await page
    .getByRole('textbox', { name: 'Your position' })
    .fill('I think AI increases creativity because it lowers the cost of trying ideas.');
  await page.getByRole('button', { name: 'Add to the debate' }).click();
  await expect(page.getByRole('heading', { name: 'Your contribution' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('article').filter({ hasText: 'lowers the cost of trying ideas' }),
  ).toBeVisible();
  await expect(page.getByText('Challenges').first()).toBeVisible({ timeout: 30_000 });

  // Continue the debate to the user's turn, then conclude.
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Next round' }).click();
    await expect(
      page.getByRole('button', { name: /Next round|Conclude: show the synthesis/ }),
    ).toBeEnabled({ timeout: 30_000 });
  }
  await expect(
    page.getByText('The participants have reached the open question. What do you think?'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Conclude: show the synthesis' }).click();
  const synthesis = page.getByRole('region', { name: 'Synthesis' });
  await expect(synthesis).toBeVisible({ timeout: 30_000 });
  await expect(synthesis.getByText('There is no winner.', { exact: false })).toBeVisible();
  await expect(synthesis.getByRole('heading', { name: 'What they disagree on' })).toBeVisible();
  await expect(synthesis.getByRole('heading', { name: 'What do you think?' })).toBeVisible();
  await expect(synthesis.getByText(/winner of/i)).toHaveCount(0);

  // Save and find it in "My debates".
  await page.getByRole('button', { name: 'Save debate' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'My debates' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Saved debates' })
      .getByRole('link', { name: 'Will AI make people less creative?' }),
  ).toBeVisible();
});

test('Arabic interface switches to right-to-left', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ما الذي تريد فحصه؟');
  await page.getByLabel('اللغة').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('keyboard users can skip to content and see focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('no horizontal overflow on the home page', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
