/* eslint-disable @typescript-eslint/no-require-imports */
// Fa el llibre en PDF (A5) a partir de llibre.html i una captura de l'e-book al mòbil per comprovar-lo.
// Ús: node tools/ebook-abp/render.js <carpeta>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const dir = path.resolve(process.argv[2] || '.');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(dir, 'llibre.html'), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  await p.pdf({ path: path.join(dir, 'Llibre_ABP_CE_Europa.pdf'), width: '148mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto('file://' + path.join(dir, 'ebook.html'), { waitUntil: 'load' });
  await m.evaluate(() => document.fonts.ready); await m.waitForTimeout(800);
  await m.screenshot({ path: path.join(dir, 'ebook-mobil.png') });
  await b.close();
})();
