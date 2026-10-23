import { expect, type Page, test } from '@playwright/test';

const api = 'http://127.0.0.1:3000';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Your notes')).toBeVisible();
}

test('a person can sign in, write a note, find it, share it, and restore it', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'long-password-1';
  const title = `Journey ${Date.now()}`;

  expect(
    (await request.post(`${api}/api/auth/register`, { data: { email, password } })).status(),
  ).toBe(201);

  await signIn(page, email, password);

  await page.getByRole('link', { name: 'New note' }).click();
  await expect(page.getByRole('heading', { name: 'Edit note' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await expect(page.getByRole('status')).toHaveText('saved');

  await signIn(page, email, password);
  await expect(page.getByRole('link', { name: title })).toBeVisible();

  const otherEmail = `reader-${Date.now()}@example.com`;
  expect(
    (
      await request.post(`${api}/api/auth/register`, { data: { email: otherEmail, password } })
    ).status(),
  ).toBe(201);
  const reader = await request.post(`${api}/api/auth/login`, {
    data: { email: otherEmail, password },
  });
  expect(reader.status()).toBe(200);
  const readerTokens = (await reader.json()) as { accessToken: string };
  const foreign = await request.get(`${api}/api/notes`, {
    headers: { authorization: `Bearer ${readerTokens.accessToken}` },
  });
  const foreignBody = (await foreign.json()) as { items: { title: string }[] };
  expect(foreignBody.items.some((item) => item.title === title)).toBe(false);

  await page.getByRole('link', { name: 'Search' }).click();
  await page.getByLabel('Query').fill(title.split(' ')[0] ?? title);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: title })).toBeVisible();

  await page.getByRole('link', { name: title }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await page
    .getByRole('button', { name: `Restore ${title}` })
    .first()
    .click();
  await expect(page.getByText('Restored')).toBeVisible();

  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Create link' }).click();
  const tokenLine = await page.getByText(/^Token /).textContent();
  const token = tokenLine?.replace('Token ', '').trim();
  expect(token).toBeTruthy();

  await page.goto(`/shared/${token}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Read only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'History' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);

  await signIn(page, email, password);
  await page.getByRole('link', { name: title }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText(/revoked/)).toBeVisible();

  await page.goto(`/shared/${token}`);
  await expect(page.getByRole('alert')).toHaveText('The requested resource was not found.');
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);

  const missing = await page.request.get(`${api}/api/shared/not-a-real-token`);
  expect(missing.status()).toBe(404);

  const login = await request.post(`${api}/api/auth/login`, { data: { email, password } });
  const tokens = (await login.json()) as { accessToken: string };
  const list = await request.get(`${api}/api/notes`, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  const body = (await list.json()) as { items: { id: string; title: string }[] };
  const note = body.items.find((item) => item.title === title);
  expect(note).toBeTruthy();
  const absent = await request.get(`${api}/api/notes/00000000-0000-4000-8000-000000000099`, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  expect(absent.status()).toBe(404);
  expect(
    (
      await request.delete(`${api}/api/notes/${note?.id}`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      })
    ).status(),
  ).toBe(204);

  await signIn(page, email, password);
  await page.getByRole('button', { name: 'Trash' }).click();
  await expect(page.getByRole('link', { name: title })).toBeVisible();
  expect(
    (
      await request.post(`${api}/api/notes/${note?.id}/restore`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});
