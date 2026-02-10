import { chromium } from 'playwright';

async function verifyGroupUI() {
  console.log('🚀 启动浏览器验证群聊管理界面...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // 监听控制台输出
  page.on('console', msg => {
    console.log('浏览器控制台:', msg.text());
  });

  try {
    console.log('📱 步骤 1: 导航到聊天页面');
    await page.goto('http://localhost:3000/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 截图1: 初始界面
    await page.screenshot({
      path: 'screenshots/verify-01-initial.png',
      fullPage: true
    });
    console.log('✅ 截图保存: verify-01-initial.png\n');

    // 查找群聊
    console.log('📱 步骤 2: 查找并点击群聊');
    const groupConversations = page.locator('[data-conversation-type="group"]');
    const groupCount = await groupConversations.count();

    if (groupCount === 0) {
      console.log('⚠️  未找到群聊，请先创建群聊');
      await page.waitForTimeout(30000);
      return;
    }

    console.log(`✅ 找到 ${groupCount} 个群聊\n`);
    await groupConversations.first().click();
    await page.waitForTimeout(2000);

    // 截图2: 群聊界面
    await page.screenshot({
      path: 'screenshots/verify-02-group-chat.png',
      fullPage: true
    });
    console.log('✅ 截图保存: verify-02-group-chat.png\n');

    // 查找并点击Info按钮
    console.log('📱 步骤 3: 点击群聊信息按钮');
    const infoButton = page.locator('button:has(svg.lucide-info)');
    const infoButtonCount = await infoButton.count();

    if (infoButtonCount === 0) {
      console.log('❌ 未找到群聊信息按钮');
      await page.screenshot({
        path: 'screenshots/verify-03-no-info-button.png',
        fullPage: true
      });
      await page.waitForTimeout(30000);
      return;
    }

    console.log('✅ 找到群聊信息按钮，点击打开面板\n');
    await infoButton.first().click();
    await page.waitForTimeout(2000);

    // 截图3: 群聊信息面板打开
    await page.screenshot({
      path: 'screenshots/verify-03-panel-open.png',
      fullPage: true
    });
    console.log('✅ 截图保存: verify-03-panel-open.png\n');

    // 检查是否有"添加成员"按钮
    console.log('📱 步骤 4: 检查管理功能按钮');
    const addMemberBtn = page.locator('button:has-text("添加成员")');
    const addMemberCount = await addMemberBtn.count();

    if (addMemberCount > 0) {
      console.log('✅ 找到"添加成员"按钮');
      await addMemberBtn.evaluate(el => {
        el.style.border = '3px solid blue';
        el.style.boxShadow = '0 0 10px blue';
      });
    } else {
      console.log('❌ 未找到"添加成员"按钮');
    }

    // 检查是否有"群聊设置"按钮
    const settingsBtn = page.locator('button:has-text("群聊设置")');
    const settingsCount = await settingsBtn.count();

    if (settingsCount > 0) {
      console.log('✅ 找到"群聊设置"按钮');
      await settingsBtn.evaluate(el => {
        el.style.border = '3px solid green';
        el.style.boxShadow = '0 0 10px green';
      });
    } else {
      console.log('❌ 未找到"群聊设置"按钮');
    }

    // 截图4: 高亮显示按钮
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'screenshots/verify-04-buttons-highlighted.png',
      fullPage: true
    });
    console.log('✅ 截图保存: verify-04-buttons-highlighted.png\n');

    // 如果找到了添加成员按钮，点击打开对话框
    if (addMemberCount > 0) {
      console.log('📱 步骤 5: 点击"添加成员"按钮');
      await addMemberBtn.click();
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: 'screenshots/verify-05-add-members-dialog.png',
        fullPage: true
      });
      console.log('✅ 截图保存: verify-05-add-members-dialog.png\n');

      // 关闭对话框
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 如果找到了群聊设置按钮，点击打开对话框
    if (settingsCount > 0) {
      console.log('📱 步骤 6: 点击"群聊设置"按钮');
      await settingsBtn.click();
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: 'screenshots/verify-06-settings-dialog.png',
        fullPage: true
      });
      console.log('✅ 截图保存: verify-06-settings-dialog.png\n');

      // 关闭对话框
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 测试点击成员头像
    console.log('📱 步骤 7: 点击成员头像测试右键菜单');
    const memberItems = page.locator('[data-member-item]').or(
      page.locator('.flex.items-center.gap-3.p-2.rounded-lg')
    );
    const memberCount = await memberItems.count();

    if (memberCount > 1) {
      console.log(`✅ 找到 ${memberCount} 个成员，点击第二个成员\n`);
      await memberItems.nth(1).click();
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: 'screenshots/verify-07-member-menu.png',
        fullPage: true
      });
      console.log('✅ 截图保存: verify-07-member-menu.png\n');
    }

    console.log('🎉 验证完成！\n');
    console.log('📊 验证结果:');
    console.log(`   - 群聊信息按钮: ${infoButtonCount > 0 ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`   - 添加成员按钮: ${addMemberCount > 0 ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`   - 群聊设置按钮: ${settingsCount > 0 ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`   - 成员列表: ${memberCount > 0 ? `✅ ${memberCount} 个成员` : '❌ 无成员'}\n`);

    console.log('⏸️  浏览器将保持打开状态 60 秒，请查看控制台调试信息');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ 验证过程中出错:', error);
    await page.screenshot({
      path: 'screenshots/verify-error.png',
      fullPage: true
    });
    console.log('✅ 错误截图保存: verify-error.png');
  } finally {
    console.log('\n👋 关闭浏览器...');
    await browser.close();
  }
}

verifyGroupUI();
