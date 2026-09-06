// Self-hosted build: the Fénix OAuth link is the session. There is no platform
// forwarder injecting a trusted user id, so identity lives entirely in the
// encrypted, HttpOnly link cookie issued after a successful authorization.
import { parseFenix } from "./schedule";

const FENIX="https://fenix.tecnico.ulisboa.pt";
const CALLBACK_PATH="/api/fenix/callback";
const STATE_COOKIE="__Host-fenix-state",LINK_COOKIE="__Host-fenix-link";
type Config={APP_ORIGIN?:string;FENIX_CLIENT_ID?:string;FENIX_CLIENT_SECRET?:string;FENIX_REDIRECT_URI?:string;FENIX_COOKIE_SECRET?:string};
type Link={accessToken:string;exp:number};
type Pending={state:string;exp:number};
const noCache={"Cache-Control":"no-store, private","Pragma":"no-cache","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const config=()=>process.env as Config;
// __Host- cookies are Secure-only, so an https origin is part of being configured.
function origin(c:Config){const raw=(c.APP_ORIGIN??"").trim().replace(/\/+$/,"");if(!raw.startsWith("https://"))return "";try{const u=new URL(raw);return u.origin===raw?raw:"";}catch{return "";}}
function callbackUrl(c:Config){const o=origin(c);return o?o+CALLBACK_PATH:"";}
function ready(c:Config) {return !!(callbackUrl(c)&&c.FENIX_CLIENT_ID&&c.FENIX_CLIENT_SECRET&&c.FENIX_COOKIE_SECRET&&c.FENIX_COOKIE_SECRET.length>=32&&c.FENIX_REDIRECT_URI===callbackUrl(c));}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:noCache});
function cookie(name:string,value:string,maxAge:number) {return name+"="+value+"; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age="+maxAge;}
function getCookie(req:Request,name:string) {return req.headers.get("Cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="))?.slice(name.length+1);}
function b64(v:Uint8Array){let s="";for(const x of v)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function unb64(s:string){return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
async function key(secret:string){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));return crypto.subtle.importKey("raw",hash,{name:"AES-GCM"},false,["encrypt","decrypt"]);}
async function seal(value:unknown,purpose:string,c:Config){
  const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(purpose)},await key(c.FENIX_COOKIE_SECRET!),new TextEncoder().encode(JSON.stringify(value)));
  return b64(iv)+"."+b64(new Uint8Array(encrypted));
}
async function unseal<T extends {exp:number}>(value:string|undefined,purpose:string,c:Config):Promise<T|null>{
  if(!value||value.length>4000||!ready(c))return null;
  try{const [iv,cipher]=value.split(".");const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(iv),additionalData:new TextEncoder().encode(purpose)},await key(c.FENIX_COOKIE_SECRET!),unb64(cipher));const parsed=JSON.parse(new TextDecoder().decode(bytes)) as T;return typeof parsed.exp==="number"&&parsed.exp>Date.now()?parsed:null;}catch{return null;}
}
// Relative Location values keep redirects correct behind any reverse proxy,
// without trusting Host or X-Forwarded-Host from the client.
function redirect(path:string,cookies:string[]=[]){
  const h=new Headers({...noCache,Location:path});cookies.forEach(s=>h.append("Set-Cookie",s));return new Response(null,{status:303,headers:h});
}
function sameOrigin(req:Request,c:Config){const o=origin(c);return !!o&&req.headers.get("Origin")===o&&req.headers.get("Sec-Fetch-Site")!=="cross-site";}
export async function status(req:Request){
  const c=config(),link=await unseal<Link>(getCookie(req,LINK_COOKIE),"link",c);
  return json({configured:ready(c),connected:!!link,callbackUrl:callbackUrl(c)});
}
export async function connect(req:Request){
  const c=config();
  if(req.headers.get("Sec-Fetch-Site")==="cross-site")return json({error:"Inicia a ligação a partir da aplicação."},403);
  if(!ready(c))return redirect("/?fenix_error=config");
  const state=b64(crypto.getRandomValues(new Uint8Array(32)));
  const pending=await seal({state,exp:Date.now()+10*60000},"state",c);
  const url=new URL(FENIX+"/oauth/userdialog");url.searchParams.set("client_id",c.FENIX_CLIENT_ID!);url.searchParams.set("redirect_uri",c.FENIX_REDIRECT_URI!);url.searchParams.set("response_type","code");url.searchParams.set("state",state);
  return new Response(null,{status:303,headers:{...noCache,Location:url.href,"Set-Cookie":cookie(STATE_COOKIE,pending,600)}});
}
export async function callback(req:Request){
  const c=config(),url=new URL(req.url),clear=cookie(STATE_COOKIE,"",0);
  if(!ready(c))return redirect("/?fenix_error=config",[clear]);
  const pending=await unseal<Pending>(getCookie(req,STATE_COOKIE),"state",c);
  // Fail closed if the provider does not echo state; never weaken CSRF checks.
  if(!pending||url.searchParams.get("state")!==pending.state)return redirect("/?fenix_error=state",[clear]);
  if(url.searchParams.has("error"))return redirect("/?fenix_error=denied",[clear]);
  const code=url.searchParams.get("code");if(!code||code.length>4096)return redirect("/?fenix_error=exchange",[clear]);
  try{
    const body=new URLSearchParams({client_id:c.FENIX_CLIENT_ID!,client_secret:c.FENIX_CLIENT_SECRET!,redirect_uri:c.FENIX_REDIRECT_URI!,code,grant_type:"authorization_code"});
    const r=await fetch(FENIX+"/oauth/access_token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body,redirect:"error",signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error("exchange");
    const tokens=await r.json() as {access_token?:unknown;expires_in?:unknown};
    if(typeof tokens.access_token!=="string"||tokens.access_token.length>1800)throw new Error("token");
    const supplied=Number(tokens.expires_in),ttl=Math.min(Number.isFinite(supplied)&&supplied>30?supplied:3600,3600)-15;
    const linked=await seal({accessToken:tokens.access_token,exp:Date.now()+ttl*1000},"link",c);
    return redirect("/",[clear,cookie(LINK_COOKIE,linked,Math.floor(ttl))]);
  }catch{return redirect("/?fenix_error=exchange",[clear]);}
}
export async function calendar(req:Request){
  const c=config();
  if(!ready(c))return json({error:"A ligação Fénix ainda não foi configurada."},503);
  const link=await unseal<Link>(getCookie(req,LINK_COOKIE),"link",c);
  if(!link)return json({error:"A ligação expirou. Liga novamente a tua conta Fénix."},401);
  try{
    const url=new URL(FENIX+"/api/fenix/v1/person/calendar/classes");url.searchParams.set("format","json");url.searchParams.set("lang","pt-PT");
    // The official Fénix documentation specifies query authentication.
    // The token is used only server-to-server, never exposed to frontend JS or logs.
    url.searchParams.set("access_token",link.accessToken);
    const r=await fetch(url,{headers:{Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
    if(r.status===401||r.status===403)return json({error:"O Fénix recusou o acesso. Verifica a autorização do calendário e volta a ligar a conta."},401);
    if(!r.ok)return json({error:"O Fénix está indisponível. Tenta novamente daqui a pouco."},502);
    // Bound response size before parsing.
    if(!r.body)throw new Error("empty");
    const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();throw new Error("size");}chunks.push(value);}
    const all=new Uint8Array(size);let pos=0;for(const b of chunks){all.set(b,pos);pos+=b.length;}
    return json(parseFenix(JSON.parse(new TextDecoder().decode(all))));
  }catch{return json({error:"Não foi possível interpretar o calendário do Fénix. Tenta novamente ou confirma o horário no portal."},502);}
}
export async function disconnect(req:Request){
  if(!sameOrigin(req,config()))return json({error:"Pedido inválido."},403);
  const h=new Headers(noCache);h.set("Content-Type","application/json");h.append("Set-Cookie",cookie(LINK_COOKIE,"",0));h.append("Set-Cookie",cookie(STATE_COOKIE,"",0));
  return new Response(JSON.stringify({ok:true}),{headers:h});
}
