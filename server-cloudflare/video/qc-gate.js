// video/qc-gate.js —— 跨镜主体一致性门
import { readFileSync } from 'fs';
export async function frameConsistencyGate(env, { frames, expected }) {
  const out=[];
  for (const f of frames) {
    const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.ARK_API_KEY},body:JSON.stringify({model:env.VISION_MODEL||'doubao-seed-2-1-turbo-260628',messages:[{role:'user',content:[{type:'text',text:`Judge: 1) is the main product the SAME ${expected} across frames (same color/appearance)? 2) is it the sole hero with NO unrelated object (bottles, other brands, other bikes)? Reply JSON {same:bool,solo:bool,note:string}.`},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+readFileSync(f).toString('base64')}}]}],max_tokens:200})});
    const j=await r.json();
    const txt=j.choices?.[0]?.message?.content||'{}';
    let v={same:false,solo:false};
    try{const m=txt.replace(/```json/g,'').replace(/```/g,'');const s=m.indexOf('{');const e=m.lastIndexOf('}');v=JSON.parse(m.slice(s,e+1));}catch{}
    out.push({frame:f,same:!!v.same,solo:!!v.solo,note:v.note});
  }
  return {pass:out.every(o=>o.same&&o.solo),frames:out};
}
export default { frameConsistencyGate };
