// Optional export. The viewer itself has no browser automation or encoder dependencies.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

async function record(){
  const [input,output,mode,...extra]=process.argv.slice(2);
  const gallery=mode==='--gallery',fps=gallery?30:24;
  if(!input||!output||(mode&&!gallery)||extra.length||path.extname(output).toLowerCase()!=='.mp4'){
    throw new Error('Usage: node record-film.mjs review.html new-film.mp4 [--gallery]');
  }
  await fs.access(input);
  const require=createRequire(path.resolve('package.json'));
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,
    args:['--enable-webgl','--enable-unsafe-swiftshader']});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mw-record-'));
  try{
    const page=await browser.newPage({offline:true,viewport:gallery?{width:1920,height:1080}:{width:1280,height:720}});
    await page.addInitScript(()=>{window.__MW_CAPTURE=true;});
    await page.goto(pathToFileURL(path.resolve(input)).href);
    await page.waitForFunction(()=>Boolean(window.modworkFilm||document.querySelector('.film-error')));
    const duration=await page.evaluate(()=>window.modworkFilm?.duration);
    if(!duration)throw new Error('浏览器未能初始化 3D 导览。');
    if(gallery){
      await page.getByRole('button',{name:'纯画面',exact:true}).click();
      await page.addStyleTag({content:'.stage-caption{display:none!important}.film-visual{outline:0!important}'});
    }
    const video=path.join(temp,'record.mp4');
    const cmd=spawn(process.env.FFMPEG||'ffmpeg',['-loglevel','error','-f','image2pipe','-framerate',String(fps),'-i','-','-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-movflags','+faststart',video],{stdio:['pipe','ignore','inherit']});
    const encoded=new Promise((resolve,reject)=>{cmd.once('error',reject);cmd.once('close',c=>c===0?resolve():reject(new Error('ffmpeg exited '+c)));});
    async function* frames(){
      for(let i=0;i<Math.round(duration*fps);i++){
        await page.evaluate(async t=>{window.modworkFilm.seek(t);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},i/fps);
        yield await page.screenshot({type:'jpeg',quality:94});
      }
    }
    try{await Promise.all([encoded,pipeline(Readable.from(frames()),cmd.stdin)]);}
    finally{if(cmd.exitCode===null)cmd.kill();}
    await fs.copyFile(video,output,constants.COPYFILE_EXCL);
    console.log(path.resolve(output));
  }finally{await browser.close();await fs.rm(temp,{recursive:true,force:true});}
}
record().catch(e=>{console.error(e.message);process.exitCode=1;});
