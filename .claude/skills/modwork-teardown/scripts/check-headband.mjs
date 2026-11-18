// Focused offline interaction regression for the hb-viewport3.json example.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const pixels=async el=>createHash('sha256').update(await el.screenshot()).digest('hex');
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const [input,pictures,...extra]=process.argv.slice(2);
if(!input||extra.length)throw new Error('Usage: node check-headband.mjs review.html [new-screenshot-directory]');
if(pictures)await fs.mkdir(pictures);
const {chromium}=createRequire(path.resolve('package.json'))(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:['--enable-webgl','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({offline:true,viewport:{width:1280,height:720},reducedMotion:'reduce'});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(path.resolve(input)).href);
  await page.waitForFunction(()=>!!window.modworkFilm);
  const button=name=>page.getByRole('button',{name,exact:true}),picker=page.getByLabel('导览护具'),slider=page.getByRole('slider');
  const time=()=>page.evaluate(()=>window.modworkFilm.time),paused=()=>button('暂停导览').count().then(n=>n===0);
  const focus=locator=>locator.evaluate(e=>e===document.activeElement);
  const shot=async name=>{if(pictures)await page.screenshot({path:path.join(pictures,name+'.png')});};
  assert.ok(await paused());
  await button('分离').click();
  assert.equal(await time(),8);
  assert.match(await page.locator('.film-sub').innerText(),/原始发带/);
  assert.ok(await page.locator('.lift-guide').evaluate(p=>Number(p.style.opacity)>.5&&p.getTotalLength()>25));
  await shot('separation');
  await button('纯画面').click();assert.ok(!(await slider.isVisible()));assert.equal(await time(),8);
  const galleryBox=await page.locator('.film-visual').boundingBox();assert.equal(galleryBox.width,1280);assert.equal(galleryBox.height,720);
  await page.keyboard.press('Escape');assert.ok(await slider.isVisible());await page.locator('.film-clock').click();
  const stage=page.locator('.film-visual'),view=stage.locator('canvas'),box=await stage.boundingBox();
  const x=box.x+box.width*.7,y=box.y+box.height*.45,initial=await pixels(view);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+25,{steps:8});await page.mouse.up();
  const angled=await pixels(view);assert.notDeepEqual(angled,initial);assert.equal(await time(),8);
  await page.mouse.wheel(0,-160);await page.waitForTimeout(120);const closer=await pixels(view);assert.notDeepEqual(closer,angled);
  await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(x+138,y+54);await page.mouse.up();await page.keyboard.up('Shift');
  const panned=await pixels(view);assert.notDeepEqual(panned,closer);
  await button('自由复查').click();await button('← 返回拆解导览').click();assert.equal(await time(),8);
  // Compare the drawing buffer via a common focus state, excluding the CSS keyboard focus outline.
  await page.mouse.move(0,0);await page.locator('.film-clock').click();assert.equal(await pixels(view),panned,'restored hand camera');
  await stage.focus();await stage.press('Home');await page.locator('.film-clock').click();assert.equal(await pixels(view),initial,'restored director camera');


  for(const [id,title,evidence,vertices,mm] of [
    ['headband','严重风险','3,484 个面边采样中有 9 个穿入。','1 / 217','−3.338 mm'],
    ['headband_fury','通过','2,630 个面边采样均未检出穿入。','0 / 196','+3.638 mm'],
    ['headband_tie','严重风险','3,983 个面边采样中有 28 个穿入。','0 / 508','+3.335 mm']
  ]){
    const before=await time();await picker.focus();await picker.selectOption(id);
    assert.equal(await time(),before);assert.ok(await paused()&&await focus(picker));
    await button('剖切').click();assert.equal(await time(),14);
    assert.match(await page.locator('.film-sub').innerText(),/贴合结果/);
    if(id==='headband')assert.match(await page.locator('.film-copy').innerText(),/30\.7 mm/);
    assert.ok(await page.locator('.section-readout').isVisible());
    const [body,gear]=await page.locator('.section-readout canvas').evaluate(c=>{
      const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let body=0,gear=0;
      for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<48)continue;
        if(pixels[i+1]>pixels[i]+8)body++;
        if(pixels[i]>pixels[i+1]+35)gear++;}
      return [body,gear];
    });assert.ok(body>5&&gear>5,'Both actual mesh contours must be visible for '+id);
    if(id==='headband')await shot('section');
    await button('测量').click();assert.equal(await time(),19);
    assert.equal(await page.locator('h1').innerText(),title);
    assert.equal(await page.locator('.result-evidence').innerText(),evidence);
    assert.deepEqual(await page.locator('.result-metrics dd').allTextContents(),[vertices,mm]);
    assert.equal(await page.locator('.film-mark').evaluate(e=>+e.style.opacity>0),id==='headband');
    await shot(id);
  }

  // Terminal and arbitrary paused frames survive a round trip, even if the inspector changes the item.
  await slider.press('End');assert.equal(await time(),22);
  const inspect=button('自由复查'),back=button('← 返回拆解导览');
  await inspect.click();assert.ok(await focus(back));
  assert.equal(await page.locator('aside h2').innerText(),'严重风险');
  await page.getByRole('combobox',{name:'护具',exact:true}).selectOption('headband_fury');
  assert.equal(await page.locator('aside h2').innerText(),'通过');
  await back.press('Enter');assert.equal(await picker.inputValue(),'headband_fury');
  assert.equal(await time(),22);assert.ok(await button('重播导览').isVisible()&&await focus(inspect));
  await slider.click({position:{x:Math.floor((await slider.boundingBox()).width*.56),y:12}});
  const t=await time();assert.ok(t>10.8&&t<16.8);
  const frame=await pixels(page.locator('.film-visual canvas'));
  await inspect.click();await back.click();assert.equal(await time(),t);assert.ok(await paused());
  assert.deepEqual(await pixels(page.locator('.film-visual canvas')),frame);

  // During playback the inspector freezes elapsed time and returns to the prior play state.
  await button('播放导览').click();await page.waitForFunction(v=>window.modworkFilm.time>v+.1,t);
  const switching=await time();await picker.selectOption('headband_tie');
  const switched=await time();assert.ok(await button('暂停导览').isVisible()&&switched>=switching&&switched<switching+.65);
  const leaving=await time();await inspect.click();await page.waitForTimeout(850);await back.click();
  const returned=await time();assert.ok(returned>=leaving&&returned<leaving+.65);
  await page.waitForFunction(v=>window.modworkFilm.time>v+.1,returned);
  await button('测量').click();
  for(const [width,height] of [[390,780],[320,568],[740,600]]){
    await page.setViewportSize({width,height});
    const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,
      bottom:document.querySelector('.film-transport').getBoundingClientRect().bottom,
      title:document.querySelector('.film-copy h1').getBoundingClientRect().top,
      top:document.querySelector('.film-top').getBoundingClientRect().bottom,
      evidence:document.querySelector('.result-metrics').getBoundingClientRect().bottom,
      controls:document.querySelector('.film-transport').getBoundingClientRect().top,
      chart:document.querySelector('.section-readout').getBoundingClientRect().top,
      model:document.querySelector('.film-visual').getBoundingClientRect().bottom}));
    assert.ok(layout.width<=width&&layout.bottom<=height+1&&layout.top<=layout.title&&layout.evidence<=layout.controls,JSON.stringify(layout));
    if(width<=700)assert.ok(layout.chart>=layout.model,'The mobile chart must not cover the model');
    await shot('measure-'+width);
    if(width===390&&pictures){
      await picker.selectOption('headband_fury');await shot('fury-390');await picker.selectOption('headband_tie');
    }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS: real chapter frames, three verdicts, paused/playing round trips, focus, offline and narrow layouts.');
}finally{await browser.close();}
