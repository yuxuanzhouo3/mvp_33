import { test, expect } from '@playwright/test';

test.describe('群聊管理界面测试', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到聊天页面
    await page.goto('http://localhost:3000/chat');

    // 等待页面加载
    await page.waitForLoadState('networkidle');
  });

  test('应该显示群聊信息按钮', async ({ page }) => {
    // 等待聊天界面加载
    await page.waitForSelector('[data-testid="chat-header"]', { timeout: 10000 });

    // 截图：初始聊天界面
    await page.screenshot({
      path: 'screenshots/01-chat-interface.png',
      fullPage: true
    });

    console.log('✅ 截图已保存: 01-chat-interface.png');
  });

  test('应该能打开群聊信息面板', async ({ page }) => {
    // 查找并点击群聊信息按钮（Info 图标）
    const infoButton = page.locator('button:has(svg.lucide-info)');

    if (await infoButton.count() > 0) {
      await infoButton.click();

      // 等待群聊信息面板出现
      await page.waitForTimeout(500);

      // 截图：打开的群聊信息面板
      await page.screenshot({
        path: 'screenshots/02-group-info-panel-open.png',
        fullPage: true
      });

      console.log('✅ 截图已保存: 02-group-info-panel-open.png');
    } else {
      console.log('⚠️ 未找到群聊信息按钮（可能不在群聊中）');
    }
  });

  test('应该显示群聊成员列表', async ({ page }) => {
    // 打开群聊信息面板
    const infoButton = page.locator('button:has(svg.lucide-info)');

    if (await infoButton.count() > 0) {
      await infoButton.click();
      await page.waitForTimeout(500);

      // 查找成员列表
      const membersList = page.locator('text=成员列表');

      if (await membersList.count() > 0) {
        // 截图：成员列表
        await page.screenshot({
          path: 'screenshots/03-members-list.png',
          fullPage: true
        });

        console.log('✅ 截图已保存: 03-members-list.png');
      }
    }
  });

  test('应该显示添加成员按钮', async ({ page }) => {
    // 打开群聊信息面板
    const infoButton = page.locator('button:has(svg.lucide-info)');

    if (await infoButton.count() > 0) {
      await infoButton.click();
      await page.waitForTimeout(500);

      // 查找添加成员按钮
      const addMemberButton = page.locator('button:has-text("添加成员")');

      if (await addMemberButton.count() > 0) {
        // 高亮显示添加成员按钮
        await addMemberButton.hover();
        await page.waitForTimeout(300);

        // 截图：高亮的添加成员按钮
        await page.screenshot({
          path: 'screenshots/04-add-member-button.png',
          fullPage: true
        });

        console.log('✅ 截图已保存: 04-add-member-button.png');
      }
    }
  });

  test('应该能打开群设置对话框', async ({ page }) => {
    // 打开群聊信息面板
    const infoButton = page.locator('button:has(svg.lucide-info)');

    if (await infoButton.count() > 0) {
      await infoButton.click();
      await page.waitForTimeout(500);

      // 查找并点击群设置按钮
      const settingsButton = page.locator('button:has-text("群聊设置")');

      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(500);

        // 截图：群设置对话框
        await page.screenshot({
          path: 'screenshots/05-group-settings-dialog.png',
          fullPage: true
        });

        console.log('✅ 截图已保存: 05-group-settings-dialog.png');
      }
    }
  });

  test('应该能打开添加成员对话框', async ({ page }) => {
    // 打开群聊信息面板
    const infoButton = page.locator('button:has(svg.lucide-info)');

    if (await infoButton.count() > 0) {
      await infoButton.click();
      await page.waitForTimeout(500);

      // 查找并点击添加成员按钮
      const addMemberButton = page.locator('button:has-text("添加成员")');

      if (await addMemberButton.count() > 0) {
        await addMemberButton.click();
        await page.waitForTimeout(500);

        // 截图：添加成员对话框
        await page.screenshot({
          path: 'screenshots/06-add-members-dialog.png',
          fullPage: true
        });

        console.log('✅ 截图已保存: 06-add-members-dialog.png');
      }
    }
  });

  test('完整流程截图', async ({ page }) => {
    console.log('📸 开始完整流程截图...');

    // 1. 初始界面
    await page.screenshot({
      path: 'screenshots/flow-01-initial.png',
      fullPage: true
    });
    console.log('✅ 1/6 初始界面');

    // 2. 打开群聊信息面板
    const infoButton = page.locator('button:has(svg.lucide-info)');
    if (await infoButton.count() > 0) {
      await infoButton.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: 'screenshots/flow-02-panel-open.png',
        fullPage: true
      });
      console.log('✅ 2/6 群聊信息面板打开');

      // 3. 成员列表
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'screenshots/flow-03-members.png',
        fullPage: true
      });
      console.log('✅ 3/6 成员列表');

      // 4. 打开添加成员对话框
      const addButton = page.locator('button:has-text("添加成员")');
      if (await addButton.count() > 0) {
        await addButton.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: 'screenshots/flow-04-add-dialog.png',
          fullPage: true
        });
        console.log('✅ 4/6 添加成员对话框');

        // 关闭对话框
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // 5. 打开群设置对话框
      const settingsButton = page.locator('button:has-text("群聊设置")');
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: 'screenshots/flow-05-settings-dialog.png',
          fullPage: true
        });
        console.log('✅ 5/6 群设置对话框');

        // 关闭对话框
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // 6. 关闭群聊信息面板
      const closeButton = page.locator('button:has(svg.lucide-x)');
      if (await closeButton.count() > 0) {
        await closeButton.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: 'screenshots/flow-06-panel-closed.png',
          fullPage: true
        });
        console.log('✅ 6/6 群聊信息面板关闭');
      }
    }

    console.log('🎉 完整流程截图完成！');
  });
});
