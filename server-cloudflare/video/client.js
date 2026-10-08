// video/client.js —— 火山 Seedance 异步图生视频客户端
import { fetchWithTimeout } from '../copywriting/http-util.js';
const SUBMIT='https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
export async function i2v(env, { imageUrl, prompt, duration=5, ratio='9:16', resolution='720p', model='doubao-seedance-2-0-mini-260615', generateAudio=true, signal }) {
  const key = env.ARK_API_KEY;
  const body = { model, content: [
    { type:'text', text: prompt },
    { type:'image_url', image_url: { url: imageUrl }, role:'reference_image' }
  ], resolution, ratio, duration, watermark:false, generate_audio:generateAudio };
  const r = await fetchWithTimeout(SUBMIT, { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+key}, body:JSON.stringify(body) }, 30000, signal);
  const j = await r.json();
  if (!r.ok) throw new Error('submit '+r.status+' '+JSON.stringify(j).slice(0,200));
  return j.id;
}
export async function poll(env, id, signal, totalMs=20*60*1000) {
  const key = env.ARK_API_KEY; const deadline=Date.now()+totalMs;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,6000));
    const r=await fetchWithTimeout(SUBMIT+'/'+id,{headers:{Authorization:'Bearer '+key}},30000,signal);
    const j=await r.json();
    if(j.status==='succeeded') return {ok:true,url:j.content.video_url,usage:j.usage};
    if(j.status==='failed') return {ok:false,reason:j.error&&j.error.message};
  }
  return {ok:false,reason:'poll_timeout'};
}
export default { i2v, poll };
