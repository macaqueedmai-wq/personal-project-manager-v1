import { expect, test } from '@playwright/test';

const OWNER_PASSWORD = 'e2e-owner-password';

test.use({ viewport: { width: 1440, height: 900 } });

test('登入、快速新增、重新整理、無痕式重登後任務仍存在', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('擁有者密碼').fill('wrong-password');
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page.getByRole('alert')).toContainText('密碼不正確');

  await page.getByLabel('擁有者密碼').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page.getByRole('heading', { name: '總覽', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '學業 HKU-MAAIES' })).toBeVisible();

  const title = `閱讀方法論文章（瀏覽器測試 ${Date.now()}）`;
  await page.getByLabel('任務標題').fill(title);
  await page.getByRole('button', { name: '加入', exact: true }).click();
  await expect(page.getByText(`已新增「${title}」`)).toBeVisible();

  await page.getByRole('link', { name: '收件箱' }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.goto('/');
  await page.screenshot({ path: 'test-results/m1-dashboard-1440.png', fullPage: true });

  await page.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('擁有者密碼').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('390 像素寬仍可完成快速新增，沒有水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('擁有者密碼').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page.getByRole('heading', { name: '總覽', level: 1 })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const title = `窄畫面任務 ${Date.now()}`;
  await page.getByLabel('任務標題').fill(title);
  await page.getByRole('button', { name: '加入', exact: true }).click();
  await page.getByRole('link', { name: '收件箱' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.screenshot({ path: 'test-results/m1-dashboard-390.png', fullPage: true });
});
