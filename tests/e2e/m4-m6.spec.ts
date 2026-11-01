import { expect, test } from '@playwright/test';

const OWNER_PASSWORD = 'e2e-owner-password';

test.use({ viewport: { width: 1440, height: 900 } });

test('M4–M6 主要頁面可導覽，活動、人物及習慣可建立', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('擁有者密碼').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page.getByRole('heading', { name: '總覽', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '日曆' }).click();
  await expect(page.getByRole('heading', { name: '日曆', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '活動', exact: true }).click();
  await expect(page.getByRole('heading', { name: '活動', level: 1 })).toBeVisible();
  const eventTitle = `E2E 活動 ${Date.now()}`;
  await page.getByLabel('標題').fill(eventTitle);
  await page.getByRole('button', { name: '新增活動' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: eventTitle, level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '日曆', exact: true }).click();
  await expect(page.getByText(eventTitle).first()).toBeVisible();

  await page.getByRole('link', { name: '人物', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人物', level: 1 })).toBeVisible();
  const contactName = `E2E 人物 ${Date.now()}`;
  await page.getByLabel('姓名', { exact: true }).fill(contactName);
  await page.getByRole('button', { name: '新增人物' }).click();
  await expect(page.getByText(`已新增「${contactName}」`)).toBeVisible();
  await page.getByRole('link', { name: contactName }).click();
  await expect(page.getByRole('heading', { name: contactName, level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '文件連結' }).click();
  await expect(page.getByRole('heading', { name: '文件連結', level: 1 })).toBeVisible();
  await page.getByLabel('標題').fill('E2E 文件');
  await page.locator('#resource-kind').selectOption('local_path');
  await page.getByLabel('路徑文字').fill('C:\\Example\\CV.pdf');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByText('已新增文件連結')).toBeVisible();

  await page.getByRole('link', { name: '習慣', exact: true }).click();
  await expect(page.getByRole('heading', { name: '習慣', level: 1 })).toBeVisible();
  const habitTitle = `E2E 習慣 ${Date.now()}`;
  await page.getByLabel('名稱').fill(habitTitle);
  await page.getByRole('button', { name: '新增習慣' }).click();
  await expect(page.getByText('已新增習慣')).toBeVisible();
  await expect(page.getByText(habitTitle)).toBeVisible();

  await page.getByRole('link', { name: '健康', exact: true }).click();
  await expect(page.getByRole('heading', { name: '健康紀錄', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '搜尋', exact: true }).click();
  await expect(page.getByRole('heading', { name: '搜尋', level: 1 })).toBeVisible();
  await page.getByLabel('關鍵字').fill('E2E');
  await expect(page.getByText(eventTitle).first()).toBeVisible();

  await page.getByRole('link', { name: '設定與備份' }).click();
  await expect(page.getByRole('heading', { name: '設定', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: '下載完整備份' })).toBeVisible();

  await page.screenshot({ path: 'test-results/m6-settings-1440.png', fullPage: true });
});
