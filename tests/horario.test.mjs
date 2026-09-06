import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const tmp=await mkdtemp(join(tmpdir(),"horario-test-"));
const origin="https://horario.test.example";
// The server reads plain process environment variables; there is no runtime binding to stub.
const serverEnv={APP_ORIGIN:origin,FENIX_CLIENT_ID:"test-client",FENIX_CLIENT_SECRET:"test-only-not-real",FENIX_COOKIE_SECRET:"test-cookie-key-32-characters-long-not-real",FENIX_REDIRECT_URI:origin+"/api/fenix/callback"};
Object.assign(process.env,serverEnv);
await build({entryPoints:["lib/schedule.ts","lib/render.ts","lib/fenix-server.ts"],bundle:true,platform:"node",format:"esm",outdir:tmp});
const s=await import(pathToFileURL(join(tmp,"schedule.js"))),r=await import(pathToFileURL(join(tmp,"render.js"))),f=await import(pathToFileURL(join(tmp,"fenix-server.js")));
const event=(start,end,title="OC : Laboratorial")=>({classPeriod:{start,end},title,course:{id:"42",acronym:"OC",name:"Organização"},location:[{name:"F2"}]});
test("parser deduplicates and retains local times and discontinuous weeks",()=>{
 const e=event("07/09/2026 09:30","07/09/2026 11:00"),e2=event("21/09/2026 09:30","21/09/2026 11:00");
 const parsed=s.parseFenix({events:[e,e,e2]});assert.equal(parsed.lessons.length,1);assert.deepEqual(parsed.lessons[0].weeks,[1,3]);assert.equal(parsed.lessons[0].day,0);assert.equal(parsed.lessons[0].start,570);assert.equal(parsed.lessons[0].kind,"LAB");
});
test("invalid dates and overnight data are reported, not silently imported",()=>{
 const parsed=s.parseFenix({events:[event("31/02/2026 09:30","31/02/2026 11:00"),event("07/09/2026 23:30","08/09/2026 01:00")]});assert.equal(parsed.skipped,2);assert.equal(parsed.lessons.length,0);assert.throws(()=>s.parseFenix({wrong:true}));
});
test("week filtering preserves gaps",()=>{
 const filtered=s.filterLessons(s.DEMO_LESSONS,"2026-09-07","2026-10-18","5");
 assert.equal(filtered.filter(l=>l.day===0).length,0);assert.ok(filtered.length>0);assert.equal(s.compactWeeks([1,2,3,4,6]),"1-4, 6");
});
test("overlapping blocks get independent lanes; distinct dates are not conflicts",()=>{
 const a=s.DEMO_LESSONS[0],b={...a,id:"other",start:600,end:700};
 assert.equal(s.positionLessons([a,b])[0].lanes,2);assert.equal(s.conflictCount([a,b]),1);assert.equal(s.conflictCount([a,{...b,dates:["2026-11-02"]}]),0);
});
test("SVG escapes user content and omits weekend by default",()=>{
 const svg=r.renderSchedule(s.DEMO_LESSONS,s.DEMO_COURSES,{...s.DEFAULT_OPTIONS,title:'<script>alert("x")</script>'});
 assert.ok(!svg.includes("<script>"));assert.ok(svg.includes("&lt;script&gt;"));assert.ok(!svg.includes("SÁBADO"));assert.ok(svg.includes("SEGUNDA"));
});
test("PDF uses A4 landscape and byte-correct xref offsets",()=>{
 const pdf=r.jpegPdf(new Uint8Array([255,216,255,217]),1,1),text=new TextDecoder("latin1").decode(pdf);
 assert.ok(text.startsWith("%PDF-1.4"));assert.ok(text.includes("/MediaBox [0 0 841.8898 595.2756]"));
 const offset=Number(/startxref\n(\d+)/.exec(text)[1]);assert.equal(text.slice(offset,offset+4),"xref");
 const entries=text.slice(offset).split("\n").slice(3,8);entries.forEach((entry,i)=>assert.ok(text.slice(Number(entry.slice(0,10))).startsWith((i+1)+" 0 obj")));
});
test("API rejects unlinked imports and cross-origin disconnects",async()=>{
 assert.equal((await f.calendar(new Request(origin+"/api/fenix/calendar"))).status,401);
 assert.equal((await f.disconnect(new Request(origin+"/api/fenix/disconnect",{method:"POST",headers:{Origin:"https://evil.example"}}))).status,403);
 assert.equal((await f.disconnect(new Request(origin+"/api/fenix/disconnect",{method:"POST",headers:{Origin:origin,"Sec-Fetch-Site":"same-origin"}}))).status,200);
});
test("status reports the configured callback without leaking secrets",async()=>{
 const body=await (await f.status(new Request(origin+"/api/fenix/status"))).json();
 assert.deepEqual(body,{configured:true,connected:false,callbackUrl:origin+"/api/fenix/callback"});
});
test("OAuth callback requires the state issued to this browser",async()=>{
 const connect=await f.connect(new Request(origin+"/api/fenix/connect",{headers:{"Sec-Fetch-Site":"same-origin"}}));
 assert.equal(connect.status,303);const cookies=connect.headers.get("set-cookie");assert.ok(cookies.includes("HttpOnly; Secure; SameSite=Lax"));assert.ok(!cookies.includes(serverEnv.FENIX_CLIENT_SECRET));
 const state=new URL(connect.headers.get("location")).searchParams.get("state");assert.ok(state.length>30);
 const stateCookie=cookies.split(";")[0];
 const missing=await f.callback(new Request(origin+"/api/fenix/callback?error=access_denied",{headers:{Cookie:stateCookie}}));
 assert.ok(missing.headers.get("location").includes("fenix_error=state"));
 const foreign=await f.callback(new Request(origin+"/api/fenix/callback?state="+state+"&error=access_denied"));
 assert.ok(foreign.headers.get("location").includes("fenix_error=state"));
 const callbackUrl=origin+"/api/fenix/callback?state="+state+"&error=access_denied";
 const denied=await f.callback(new Request(callbackUrl,{headers:{Cookie:stateCookie}}));
 assert.ok(denied.headers.get("location").includes("fenix_error=denied"));assert.ok(denied.headers.get("set-cookie").includes("Max-Age=0"));
});
test("the redirect URI is derived from APP_ORIGIN and needs no variable",async()=>{
 const saved=process.env.FENIX_REDIRECT_URI;delete process.env.FENIX_REDIRECT_URI;
 try{
  const body=await (await f.status(new Request(origin+"/api/fenix/status"))).json();
  assert.equal(body.configured,true);assert.equal(body.callbackUrl,origin+"/api/fenix/callback");
  const connect=await f.connect(new Request(origin+"/api/fenix/connect",{headers:{"Sec-Fetch-Site":"same-origin"}}));
  assert.equal(new URL(connect.headers.get("location")).searchParams.get("redirect_uri"),origin+"/api/fenix/callback");
 }finally{process.env.FENIX_REDIRECT_URI=saved;}
});
test("a declared redirect URI that disagrees with the origin fails closed",async()=>{
 const saved=process.env.FENIX_REDIRECT_URI;process.env.FENIX_REDIRECT_URI="https://old-domain.example/api/fenix/callback";
 try{
  assert.equal((await (await f.status(new Request(origin+"/api/fenix/status"))).json()).configured,false);
  assert.equal((await f.connect(new Request(origin+"/api/fenix/connect"))).headers.get("location"),"/?fenix_error=config");
 }finally{process.env.FENIX_REDIRECT_URI=saved;}
});
test("an http origin is not a usable configuration for Secure __Host- cookies",async()=>{
 const saved=process.env.APP_ORIGIN;process.env.APP_ORIGIN="http://horario.test.example";
 try{
  const body=await (await f.status(new Request(origin+"/api/fenix/status"))).json();
  assert.equal(body.configured,false);assert.equal(body.callbackUrl,"");
  assert.equal((await f.connect(new Request(origin+"/api/fenix/connect"))).headers.get("location"),"/?fenix_error=config");
 }finally{process.env.APP_ORIGIN=saved;}
});
