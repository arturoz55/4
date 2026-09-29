// Screenshots each artboard in images.html to marketing/images/<id>.png
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 1200 }, ignoreHTTPSErrors: true });
  await p.goto('file://' + path.resolve(__dirname, 'images.html'));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await p.evaluate(() => window.draw());
  for (const id of ['profile', 'header', 'launch', 'how', 'zec', 'reel']) {
    await p.locator('#' + id).screenshot({ path: path.resolve(__dirname, '..', 'images', `hyperpad-${id}.png`) });
  }
  await b.close(); console.log('done');
})();
