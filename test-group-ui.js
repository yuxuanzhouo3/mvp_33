import { chromium } from 'playwright';

async function testGroupManagement() {
  console.log('🚀 启动浏览器测试...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 导航到聊天页面
    console.log('📱 导航到聊天页面...');
    await page.goto('http://localhost:3000/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 截图1: 初始聊天界面
    await page.screenshot({
      path: 'screenshots/01-chat-interface.png',
      fullPage: true
    });
    console.log('✅ 截图已保存: 01-chat-interface.png');

    // 查找群聊信息按钮（Info 图标）
    const infoButton = page.locator('button:has(svg.lucide-info)');
    const infoButtonCount = await infoButton.count();

    if (infoButtonCount > 0) {
      console.log('🔍 找到群聊信息按钮��点击打开面板...');
      await infoButton.click();
      await page.waitForTimeout(1000);

      // 截图2: 打开的群聊信息面板
      await page.screenshot({
        path: 'screenshots/02-group-info-panel-open.png',
        fullPage: true
      });
      console.log('✅ 截图已保存: 02-group-info-panel-open.png');

      // 查找成员列表
      const membersList = page.locator('text=成员列表');
      if (await membersList.count() > 0) {
        console.log('👥 找到成员列表');
        await page.screenshot({
          path: 'screenshots/03-members-list.png',
          fullPage: true
        });
        console.log('✅ 截图已保存: 03-members-list.png');
      }

      // 查找添加成员按钮
      const addMemberButton = page.locator('button:has-text("添加成员")');
      if (await addMemberButton.count() > 0) {
        console.log('➕ 找到添加成员按钮');
        await addMemberButton.hover();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: 'screenshots/04-add-member-button.png',
          fullPage: true
        });
        console.log('✅ 截图已保存: 04-add-member-button.png');

        // 点击打开添加成员对话框
        await addMemberButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: 'screenshots/05-add-members-dialog.png',
          fullPage: true
        });
        console.log('✅ 截图已保存: 05-add-members-dialog.png');

        // 关闭对话框
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      // 查找群设置按钮
      const settingsButton = page.locator('button:has-text("群聊设置")');
      if (await settingsButton.count() > 0) {
        console.log('⚙️ 找到群设置按钮');
        await settingsButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: 'screenshots/06-group-settings-dialog.png',
          fullPage: true
        });
        console.log('✅ 截图已保存: 06-group-settings-dialog.png');

        // 关闭对话框
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      // 关闭群聊信息面板
      const closeButton = page.locator('button:has(svg.lucide-x)');
      if (await closeButton.count() > 0) {
        await closeButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: 'screenshots/07-panel-closed.png',
          fullPage: true
        });
        console.log('✅ 截图已保存: 07-panel-closed.png');
      }

      console.log('🎉 测试完成！所有截图已保存到 screenshots 目录');
    } else {
      console.log('⚠️ 未找到群聊信息按钮（可能不在群聊中）');
      console.log('💡 提示：请先创建或进入一个群聊，然后再运行测试');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
    await page.screenshot({
      path: 'screenshots/error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }
}

testGroupManagement();
