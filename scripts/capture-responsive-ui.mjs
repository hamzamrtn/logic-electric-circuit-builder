import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
await mkdir('docs/evidence/responsive-toolbar', { recursive: true });
const browser = await chromium.launch();
try {
 for (const [name,width,height,theme] of [['desktop',1440,950,'light'],['phone',390,844,'dark'],['small-phone',320,720,'light'],['tablet',768,1024,'dark']]) {
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,isMobile:width<1000,hasTouch:width<1000,reducedMotion:'reduce'});
  await page.goto(pathToFileURL(resolve('dev/preview.html')).href+'?theme='+theme);await page.getByTestId('editor').waitFor();
  const doc=JSON.parse(await readFile(`examples/showcase/${width>1000?'desktop':'mobile'}-analog.lecircuit`,'utf8'));
  await page.evaluate(doc=>window.__lec.session.replaceRaw(JSON.stringify(doc)),doc);
  await page.getByRole('button',{name:'Fit circuit',exact:true}).click();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:`docs/evidence/responsive-toolbar/${name}-${theme}.png`});
  await page.getByRole('button',{name:'Add parts',exact:true}).click();
  await page.getByRole('tab',{name:'Connections parts',exact:true}).click();
  await page.screenshot({path:`docs/evidence/responsive-toolbar/${name}-picker-${theme}.png`});
  if(name==='phone') {
    await page.getByRole('button',{name:'Test point Connectivity',exact:true}).click();
    await page.getByRole('application').hover({position:{x:80,y:100}});
    await page.screenshot({path:'docs/evidence/responsive-toolbar/phone-placement-dark.png'});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    const component=doc.components.find(c=>c.reference==='R1');
    await page.locator(`[data-object="${component.id}"] .lec-part-hit`).click();
    await page.screenshot({path:'docs/evidence/responsive-toolbar/phone-selection-dark.png'});
    await page.getByRole('button',{name:'Inspect',exact:true}).click();
    await page.screenshot({path:'docs/evidence/responsive-toolbar/phone-inspector-dark.png'});
  }
  console.log(name,await page.locator('.lec-topbar').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth})),await page.locator('.lec-drawing-toolbar').boundingBox());
  await page.close();
 }
} finally {await browser.close()}
