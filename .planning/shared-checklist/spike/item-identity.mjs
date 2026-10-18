// Experiment: explicit stable markers, not line-number or text matching.
import { randomUUID } from 'node:crypto';
const task=/^([ \t]*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/;
const marker=/\s*<!-- fusen-item:([a-zA-Z0-9-]+) -->\s*$/;
export function identify(markdown, createId=randomUUID) {
  const seen=new Set();
  return markdown.split('\n').map(line=>{
    if(!task.test(line))return line;
    const old=line.match(marker);const id=old?.[1]??createId();
    if(!/^[a-zA-Z0-9-]+$/.test(id)||seen.has(id))throw Error('Ambiguous item identity');
    seen.add(id);return old?line:line+' <!-- fusen-item:'+id+' -->';
  }).join('\n');
}
export function applyCheck(markdown,itemId,checked){
  if(typeof checked!=='boolean')throw Error('Invalid state');
  let matches=0;
  const result=markdown.split('\n').map(line=>{const m=line.match(task);if(!m||line.match(marker)?.[1]!==itemId)return line;matches++;return m[1]+(checked?'x':' ')+m[3]+m[4];}).join('\n');
  if(matches!==1)throw Error('Item missing or ambiguous');return result;
}
