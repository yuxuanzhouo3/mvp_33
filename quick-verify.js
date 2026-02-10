import { chromium } from 'playwright';

async function quickVerify() {
  console.log('🚀 快速验证修复效果...\n');

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
    const text = msg.text();
    if (text.includes('当前用户角色') || text.includes('isOwner') || text.includes('isAdmin')) {
      console.log('浏览器控制台:', text);
    }
  });

  try {
    console.log('📱 导航到聊天页面');
    await page.goto('http://localhost:3000/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 查找群聊
    const groupConversations = page.locator('[data-conversation-type="group"]');
    const groupCount = await groupConversations.count();

    if (groupCount === 0) {
      console.log('⚠️  未找到群聊');
      await page.waitForTimeout(10000);
      await browser.close();
      return;
    }

    console.log(`✅ 找到 ${groupCount} 个群聊\n`);
    await groupConversations.first().click();
    await page.waitForTimeout(2000);

    // 点击Info按钮
    const infoButton = page.locator('button:has(svg.lucide-info)');
    if (await infoButton.count() > 0) {
      console.log('✅ 找到Info按钮，点击打开面板\n');
      await infoButton.first().click();
      await page.waitForTimeout(2000);

      // 检查按钮
      const addMemberBtn = page.locator('button:has-text("添加成员")');
      const settingsBtn = page.locator('button:has-text("群聊设置")');

      const addMemberCount = await addMemberBtn.count();
      const settingsCount = await settingsBtn.count();

      console.log('\n📊 验证结果:');
      console.log(`   - 添加成员按钮: ${addMemberCount > 0 ? '✅ 存在' : '❌ 不存在'}`);
      console.log(`   - 群聊设置按钮: ${settingsCount > 0 ? '✅ 存在' : '❌ 不存在'}`);

      if (addMemberCount > 0 && settingsCount > 0) {
        console.log('\n🎉 修复成功！所有按钮都正常显示！');
      } else {
        console.log('\n❌ 修复失败，按钮仍然不显示');
      }

      await page.screenshot({
        path: 'screenshots/verify-fix.png',
        fullPage: true
      });
      console.log('\n✅ 截图保存: screenshots/verify-fix.png');

      console.log('\n⏸️  浏览器将保持打开30秒，请查看界面');
      await page.waitForTimeout(30000);
    }

  } catch (error) {
    console.error('❌ 验证失败:', error);
  } finally {
    await browser.close();
  }
}

quickVerify();
