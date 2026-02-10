import { chromium } from 'playwright';

async function demonstrateGroupManagement() {
  console.log('🚀 启动浏览器演示群聊管理功能...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000 // 放慢操作速度，便于观察
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('📱 步骤 1: 导航到聊天页面');
    await page.goto('http://localhost:3000/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 截图1: 初始界面
    await page.screenshot({
      path: 'screenshots/demo-01-initial.png',
      fullPage: true
    });
    console.log('✅ 截图保存: demo-01-initial.png\n');

    // 检查是否已登录
    const loginButton = page.locator('text=登录');
    if (await loginButton.count() > 0) {
      console.log('⚠️  检测到未登录状态');
      console.log('💡 请在打开的浏览器中手动登录\n');
      console.log('等待 30 秒供你登录...');
      await page.waitForTimeout(30000);
    }

    console.log('📱 步骤 2: 查找群聊');
    // 查找群聊会话
    const groupConversations = page.locator('[data-conversation-type="group"]');
    const groupCount = await groupConversations.count();

    if (groupCount === 0) {
      console.log('⚠️  未找到群聊');
      console.log('💡 请在打开的浏览器中:');
      console.log('   1. 点击"创建群聊"按钮');
      console.log('   2. 选择至少 2 个联系人');
      console.log('   3. 创建群聊\n');
      console.log('等待 30 秒供你创建群聊...');
      await page.waitForTimeout(30000);
    } else {
      console.log(`✅ 找到 ${groupCount} 个群聊\n`);

      // 点击第一个群聊
      console.log('📱 步骤 3: 进入群聊');
      await groupConversations.first().click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: 'screenshots/demo-02-group-chat.png',
        fullPage: true
      });
      console.log('✅ 截图保存: demo-02-group-chat.png\n');
    }

    // 查找群聊信息按钮
    console.log('📱 步骤 4: 查找群聊信息按钮');
    const infoButton = page.locator('button:has(svg.lucide-info)');
    const infoButtonCount = await infoButton.count();

    if (infoButtonCount === 0) {
      console.log('❌ 未找到群聊信息按钮');
      console.log('💡 可能的原因:');
      console.log('   1. 当前不在群聊中');
      console.log('   2. 按钮选择器不正确');
      console.log('   3. 组件未正确渲染\n');

      // 尝试查找所有按钮
      console.log('🔍 查找页面上的所有按钮...');
      const allButtons = page.locator('button');
      const buttonCount = await allButtons.count();
      console.log(`找到 ${buttonCount} 个按钮\n`);

      // 截图当前状态
      await page.screenshot({
        path: 'screenshots/demo-03-no-info-button.png',
        fullPage: true
      });
      console.log('✅ 截图保存: demo-03-no-info-button.png\n');

      console.log('⏸️  浏览器将保持打开状态 60 秒，请手动检查界面');
      await page.waitForTimeout(60000);

    } else {
      console.log(`✅ 找到群聊信息按钮 (${infoButtonCount} 个)\n`);

      // 高亮显示按钮
      await infoButton.first().evaluate(el => {
        el.style.border = '3px solid red';
        el.style.boxShadow = '0 0 10px red';
      });

      await page.screenshot({
        path: 'screenshots/demo-03-info-button-highlighted.png',
        fullPage: true
      });
      console.log('✅ 截图保存: demo-03-info-button-highlighted.png (按钮已高亮)\n');

      // 点击打开群聊信息面板
      console.log('📱 步骤 5: 打开群聊信息面板');
      await infoButton.first().click();
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: 'screenshots/demo-04-panel-open.png',
        fullPage: true
      });
      console.log('✅ 截图保存: demo-04-panel-open.png\n');

      // 查找并高亮显示各个功能按钮
      console.log('📱 步骤 6: 展示群聊管理功能');

      const addMemberBtn = page.locator('button:has-text("添加成员")');
      if (await addMemberBtn.count() > 0) {
        await addMemberBtn.evaluate(el => {
          el.style.border = '2px solid blue';
        });
        console.log('✅ 找到"添加成员"按钮');
      }

      const settingsBtn = page.locator('button:has-text("群聊设置")');
      if (await settingsBtn.count() > 0) {
        await settingsBtn.evaluate(el => {
          el.style.border = '2px solid green';
        });
        console.log('✅ 找到"群聊设置"按钮');
      }

      const leaveBtn = page.locator('button:has-text("离开群聊")');
      if (await leaveBtn.count() > 0) {
        await leaveBtn.evaluate(el => {
          el.style.border = '2px solid orange';
        });
        console.log('✅ 找到"离开群聊"按钮');
      }

      await page.waitForTimeout(1000);
      await page.screenshot({
        path: 'screenshots/demo-05-features-highlighted.png',
        fullPage: true
      });
      console.log('✅ 截图保存: demo-05-features-highlighted.png (功能按钮已高亮)\n');

      // 演示打开添加成员对话框
      if (await addMemberBtn.count() > 0) {
        console.log('📱 步骤 7: 打开添加成员对话框');
        await addMemberBtn.click();
        await page.waitForTimeout(1500);

        await page.screenshot({
          path: 'screenshots/demo-06-add-members-dialog.png',
          fullPage: true
        });
        console.log('✅ 截图保存: demo-06-add-members-dialog.png\n');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      // 演示打开群设置对话框
      if (await settingsBtn.count() > 0) {
        console.log('📱 步骤 8: 打开群设置对话框');
        await settingsBtn.click();
        await page.waitForTimeout(1500);

        await page.screenshot({
          path: 'screenshots/demo-07-settings-dialog.png',
          fullPage: true
        });
        console.log('✅ 截图保存: demo-07-settings-dialog.png\n');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      console.log('🎉 演示完成！所有截图已保存到 screenshots 目录\n');
      console.log('📸 生成的截图:');
      console.log('   - demo-01-initial.png: 初始界面');
      console.log('   - demo-02-group-chat.png: 群聊界面');
      console.log('   - demo-03-info-button-highlighted.png: 群聊信息按钮（红色高亮）');
      console.log('   - demo-04-panel-open.png: 群聊信息面板打开');
      console.log('   - demo-05-features-highlighted.png: 功能按钮高亮显示');
      console.log('   - demo-06-add-members-dialog.png: 添加成员对话框');
      console.log('   - demo-07-settings-dialog.png: 群设置对话框\n');

      console.log('⏸️  浏览器将保持打开状态 30 秒，供你查看界面');
      await page.waitForTimeout(30000);
    }

  } catch (error) {
    console.error('❌ 演示过程中出错:', error);
    await page.screenshot({
      path: 'screenshots/demo-error.png',
      fullPage: true
    });
    console.log('✅ 错误截图保存: demo-error.png');
  } finally {
    console.log('\n👋 关闭浏览器...');
    await browser.close();
  }
}

demonstrateGroupManagement();
