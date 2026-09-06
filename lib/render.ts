import { Course, Lesson, Options, DAYS, compactWeeks, positionLessons, time } from "./schedule";
export const PAPER = {width:1188,height:840};
export function escapeXml(s:string) {return s.replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]!));}
function fit(s:string,width:number,size:number) { const n=Math.floor(width/(size*.57)); return s.length>n?s.slice(0,Math.max(1,n-1))+"…":s; }
function tint(hex:string,amount:number) {return "#"+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-amount)+255*amount).toString(16).padStart(2,"0")).join("");}
export function renderSchedule(lessons:Lesson[],courses:Course[],o:Options) {
  const active=lessons.filter(l=>courses.find(c=>c.id===l.courseId)?.visible && (o.weekend||l.day<5));
  const start=Math.min(480,...active.map(l=>Math.floor(l.start/60)*60)),end=Math.max(1020,...active.map(l=>Math.ceil(l.end/60)*60));
  const margin=32,top=102,bottom=807,header=37,timeWidth=77,n=o.weekend?7:5,dayWidth=(PAPER.width-2*margin-timeWidth)/n;
  const dataTop=top+header,scale=(bottom-dataTop)/(end-start),left=margin+timeWidth,right=PAPER.width-margin;
  const svg:string[]=[];
  const rect=(x:number,y:number,w:number,h:number,fill:string,stroke="none",radius=0)=>svg.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+radius+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="0.8"/>');
  const line=(x:number,y:number,x2:number,y2:number,stroke:string,width=.7)=>svg.push('<path d="M'+x+' '+y+'H'+x2+'" fill="none" stroke="'+stroke+'" stroke-width="'+width+'"/>');
  const text=(s:string,x:number,y:number,size:number,weight=400,color="#183148",anchor="start")=>svg.push('<text x="'+x+'" y="'+y+'" font-family="Arial, Helvetica, sans-serif" font-size="'+size+'" font-weight="'+weight+'" fill="'+color+'" text-anchor="'+anchor+'">'+escapeXml(s)+'</text>');
  svg.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1188 840" width="1188" height="840" role="img" aria-label="'+escapeXml(o.title)+'"><title>'+escapeXml(o.title)+'</title>');
  rect(0,0,1188,840,"#ffffff");text(fit(o.title||"Horário",1050,29),margin,65,29,700);
  rect(margin,top,right-margin,header,"#edf2f6");rect(margin,dataTop,timeWidth,bottom-dataTop,"#f8fafc");
  rect(margin,top,right-margin,bottom-top,"none","#b8c7d2");
  for(let d=0;d<=n;d++)svg.push('<path d="M'+(left+d*dayWidth)+' '+top+'V'+bottom+'" stroke="#b8c7d2" stroke-width="0.8"/>');
  text("HORAS",margin+timeWidth/2,top+24,12,700,"#51677b","middle");
  for(let d=0;d<n;d++)text(DAYS[d].toUpperCase(),left+(d+.5)*dayWidth,top+24,13,700,"#183148","middle");
  for(let m=start;m<=end;m+=30) {
    const y=dataTop+(m-start)*scale;line(margin,y,right,y,m%60===0?"#bdcbd6":"#e2e8ee",m%60===0?.85:.55);
    if(m<end)text(time(m),margin+timeWidth/2,y+15*scale+4,12,400,"#63788a","middle");
  }
  for(const l of positionLessons(active)) {
    const c=courses.find(c=>c.id===l.courseId)!,color=o.theme==="mono"?"#324b61":c.color;
    const x=left+l.day*dayWidth+dayWidth*l.lane/l.lanes+3,y=dataTop+(l.start-start)*scale+3,w=dayWidth/l.lanes-6,h=(l.end-l.start)*scale-6;
    const id="clip-"+l.id.replace(/[^a-zA-Z0-9-]/g,"");
    svg.push('<defs><clipPath id="'+id+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="6"/></clipPath></defs><g clip-path="url(#'+id+')"><title>'+escapeXml(l.name+" · "+time(l.start)+"-"+time(l.end)+" · "+l.kind+" · "+l.room+" · Semanas "+compactWeeks(l.weeks))+'</title>');
    rect(x,y,w,h,o.theme==="outline"?"#fff":tint(color,o.theme==="mono"?.94:.86),o.theme==="outline"?color:tint(color,.3),6);
    rect(x,y,4,h,color); const pad=11;
    const size=h<55?12:16; text(fit(c.acronym,w-2*pad,size),x+pad,y+(h<55?16:23),size,700);
    const meta=[o.types?l.kind:"",o.rooms?l.room:""].filter(Boolean).join("  |  ");
    if(h>=64) {
      text(fit(meta,w-pad*2,12),x+pad,y+42,12);
      if(o.weeks)text(fit("Semanas "+compactWeeks(l.weeks),w-2*pad,11),x+pad,y+h-12,11,500,"#405970");
    } else {
      const details=[meta,o.weeks?"S. "+compactWeeks(l.weeks):""].filter(Boolean).join(" · ");
      text(fit(details,w-2*pad,10),x+pad,y+h-8,10);
    }
    svg.push("</g>");
  }
  svg.push("</svg>");return svg.join("");
}
export function downloadBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function scheduleCanvas(svg:string) {
  const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
  try {
    const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error("Não foi possível renderizar o horário."));img.src=url;});
    const canvas=document.createElement("canvas");canvas.width=3508;canvas.height=2480;
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Este navegador não suporta a exportação.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas;
  }finally{URL.revokeObjectURL(url);}
}
// A single A4 PDF page with a high-quality, 300 dpi embedded JPEG.
// All lengths and xref offsets use byte counts, not JavaScript character counts.
export function jpegPdf(jpeg:Uint8Array,width:number,height:number): Uint8Array {
  const enc=new TextEncoder(),chunks:Uint8Array[]=[],offsets=[0];let length=0;
  const push=(v:string|Uint8Array)=>{const b=typeof v==="string"?enc.encode(v):v;chunks.push(b);length+=b.length;};
  const obj=(id:number,s:string)=>{offsets[id]=length;push(id+" 0 obj\n"+s+"\nendobj\n");};
  push("%PDF-1.4\n");
  obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
  obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.8898 595.2756] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  offsets[4]=length;push("4 0 obj\n<< /Type /XObject /Subtype /Image /Width "+width+" /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n");push(jpeg);push("\nendstream\nendobj\n");
  const stream="q\n841.8898 0 0 595.2756 0 0 cm\n/Im0 Do\nQ";
  obj(5,"<< /Length "+enc.encode(stream).length+" >>\nstream\n"+stream+"\nendstream");
  const xref=length;push("xref\n0 6\n0000000000 65535 f \n");offsets.slice(1).forEach(n=>push(String(n).padStart(10,"0")+" 00000 n \n"));
  push("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
  const out=new Uint8Array(length);let pos=0;for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.length;}return out;
}
export async function exportSchedule(svg:string,title:string,format:"pdf"|"png") {
  const canvas=await scheduleCanvas(svg),filename=(title||"horario").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").slice(0,80);
  if(format==="png"){const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Erro ao criar PNG.")),"image/png"));downloadBlob(blob,filename+".png");}
  else {const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Erro ao criar PDF.")),"image/jpeg",.98));const pdf=jpegPdf(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height);downloadBlob(new Blob([pdf as BlobPart],{type:"application/pdf"}),filename+".pdf");}
}
