"use client";

import {useEffect,useMemo,useState,useRef} from "react";
import {CalendarDays,Download,Link2,Settings2,Palette,RotateCcw,FileImage,Check,LockKeyhole,ArrowUpRight,RefreshCw,Info,ChevronLeft,ChevronRight,LogOut,Upload,AlertTriangle,LoaderCircle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Switch} from "@/components/ui/switch";
import {Checkbox} from "@/components/ui/checkbox";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {RadioGroup,RadioGroupItem} from "@/components/ui/radio-group";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Toaster} from "@/components/ui/sonner";
import {toast} from "sonner";
import {Course,Lesson,Options,DEMO_COURSES,DEMO_LESSONS,DEFAULT_OPTIONS,DAYS,TYPE_NAMES,filterLessons,conflictCount,coursesFor,parseFenix,time,weekNumber,addDays,monday} from "@/lib/schedule";
import {renderSchedule,exportSchedule} from "@/lib/render";

type Connection={configured:boolean;connected:boolean;callbackUrl?:string;error?:string};
const themeNames={soft:"Suave",outline:"Contorno",mono:"P&B"};
export default function TimetableEditor(){
  const [lessons,setLessons]=useState<Lesson[]>(DEMO_LESSONS),[courses,setCourses]=useState<Course[]>(DEMO_COURSES);
  const [options,setOptions]=useState<Options>(DEFAULT_OPTIONS),[from,setFrom]=useState("2026-09-07"),[to,setTo]=useState("2026-10-18"),[week,setWeek]=useState("all");
  const [source,setSource]=useState<"demo"|"fenix"|"file">("demo"),[academicTerm,setAcademicTerm]=useState("");
  const [connection,setConnection]=useState<Connection|null>(null),[dialog,setDialog]=useState(false),[busy,setBusy]=useState(false),[exporting,setExporting]=useState<"pdf"|"png"|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const filtered=useMemo(()=>filterLessons(lessons,from,to,week),[lessons,from,to,week]);
  const visible=useMemo(()=>filtered.filter(l=>courses.find(c=>c.id===l.courseId)?.visible&&(options.weekend||l.day<5)),[filtered,courses,options.weekend]);
  const svg=useMemo(()=>renderSchedule(visible,courses,options),[visible,courses,options]);
  const conflicts=conflictCount(visible);
  const weekCount=from&&to&&from<=to?Math.min(54,weekNumber(to,from)):0;
  const hiddenWeekend=filtered.filter(l=>l.day>=5&&!options.weekend&&courses.find(c=>c.id===l.courseId)?.visible).length;
  const narrow=visible.some(a=>visible.filter(b=>b.day===a.day&&b.start<a.end&&a.start<b.end).length>2);
  function option<K extends keyof Options>(k:K,v:Options[K]){setOptions(o=>({...o,[k]:v}));}
  function courseUpdate(id:string,patch:Partial<Course>){setCourses(cs=>cs.map(c=>c.id===id?{...c,...patch}:c));}
  function loadCalendar(data:ReturnType<typeof parseFenix>,type:"fenix"|"file"){
    setLessons(data.lessons);setCourses(coursesFor(data.lessons));setSource(type);setAcademicTerm(data.academicTerm);setWeek("all");
    const dates=data.lessons.flatMap(l=>l.dates).sort();
    if(dates.length){setFrom(monday(dates[0]));setTo(addDays(monday(dates[dates.length-1]),6));}
    setOptions(o=>({...o,title:"Horário",weekend:data.lessons.some(l=>l.day>=5)}));
    if(data.skipped)toast.warning(data.skipped+" ocorrência(s) não reconhecida(s). Confirma o calendário no Fénix.");
    toast.success(data.lessons.length?"Horário importado. Podes começar a personalizar.":"O Fénix não devolveu aulas.");
  }
  async function sync(){
    setBusy(true);
    try{const r=await fetch("/api/fenix/calendar",{cache:"no-store"});const data=await r.json() as ReturnType<typeof parseFenix> & {error?:string};if(!r.ok){if(r.status===401)setConnection(c=>c?{...c,connected:false}:c);throw new Error(data.error||"Não foi possível importar o horário.");}if(!Array.isArray(data.lessons))throw new Error("Resposta de calendário inválida.");loadCalendar(data,"fenix");setConnection(c=>c?{...c,connected:true}:c);}
      catch(e){toast.error(e instanceof Error?e.message:"Erro de ligação.");}finally{setBusy(false);}
  }
  useEffect(()=>{
    let alive=true;
    async function status(){
      try{const r=await fetch("/api/fenix/status",{cache:"no-store"});if(!r.ok)throw new Error();const s:Connection=await r.json();if(!alive)return;setConnection(s);if(s.connected)void sync();}
      catch{if(alive)setConnection({configured:false,connected:false,error:"Não foi possível verificar a ligação. Recarrega a página."});}
    }
    void status();
    const params=new URLSearchParams(window.location.search),err=params.get("fenix_error");
    if(err){setDialog(true);toast.error(({denied:"Autorização cancelada no Fénix.",state:"Não foi possível validar a sessão. Volta a ligar a conta.",exchange:"Não foi possível concluir a ligação. Verifica a configuração da aplicação.",config:"A ligação Fénix ainda não foi configurada."} as Record<string,string>)[err]||"Não foi possível ligar ao Fénix.");window.history.replaceState(null,"",window.location.pathname);}
    return()=>{alive=false;};
  // Import occurs once on initial connection; refresh is an explicit action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function disconnect(){
    try{const r=await fetch("/api/fenix/disconnect",{method:"POST"});if(!r.ok)throw new Error();setConnection(c=>c?{...c,connected:false}:c);setLessons(DEMO_LESSONS);setCourses(DEMO_COURSES);setOptions(DEFAULT_OPTIONS);setFrom("2026-09-07");setTo("2026-10-18");setWeek("all");setSource("demo");setAcademicTerm("");toast.success("Conta desligada e horário importado removido desta página.");}catch{toast.error("Não foi possível desligar a conta.");}
  }
  async function exportFile(format:"pdf"|"png"){
    if(!visible.length)return;setExporting(format);
    try{await exportSchedule(svg,options.title,format);toast.success(format.toUpperCase()+" preparado. Verifica os downloads do navegador.");}catch(e){toast.error(e instanceof Error?e.message:"Não foi possível exportar.");}finally{setExporting(null);}
  }
  async function importJson(file?:File){
    if(!file)return;
    try{if(file.size>5*1024*1024)throw new Error("O ficheiro deve ter menos de 5 MB.");loadCalendar(parseFenix(JSON.parse(await file.text())),"file");setDialog(false);}
    catch(e){toast.error(e instanceof Error?e.message:"Ficheiro JSON inválido.");}
    if(fileInput.current)fileInput.current.value="";
  }
  const weeksLabel=week==="all"?"Todas as semanas":"Semana "+week;
  return <div className="app-shell">
    <Toaster richColors position="bottom-center"/>
    <header className="topbar">
      <a href="/" className="brand" aria-label="Horário, início"><span className="brand-icon"><CalendarDays size={23}/></span><span>horário<span className="brand-period">.</span></span></a>
      <span className="brand-context">O teu Fénix, à tua maneira.</span>
      <div className="top-actions">
        {connection?.connected?<><span className="connected-label"><Check size={15}/> Fénix ligado</span><Button variant="ghost" size="icon" title="Desligar conta Fénix" aria-label="Desligar conta Fénix" onClick={disconnect}><LogOut/></Button></>:<Button variant="outline" onClick={()=>setDialog(true)} className="connect-button"><Link2/> Ligar ao Fénix <ArrowUpRight size={14}/></Button>}
      </div>
    </header>
    <main className="workspace">
      <div className="workspace-heading"><div><p className="eyebrow">O TEU PLANO, EM PAPEL</p><h1>Um horário à tua medida.</h1></div><div className="export-actions"><Button variant="outline" disabled={!visible.length||!!exporting} onClick={()=>exportFile("png")}><FileImage/> PNG</Button><Button className="export-main" disabled={!visible.length||!!exporting} onClick={()=>exportFile("pdf")}>{exporting?<LoaderCircle className="animate-spin"/>:<Download/>} {exporting==="pdf"?"A preparar…":"Exportar PDF"}</Button></div></div>
      <div className={"source-bar "+(source==="demo"?"demo-bar":"")}>
        <span className="source-icon">{source==="demo"?<Info size={18}/>:<Check size={18}/>}</span>
        <div><strong>{source==="demo"?"Estás a experimentar um horário de exemplo":source==="fenix"?"Horário importado do Fénix":"Calendário importado de ficheiro"}</strong><span>{source==="demo"?"Liga a tua conta para importar as tuas aulas. As datas deste exemplo são ilustrativas.":(academicTerm?academicTerm+" · ":"")+"As alterações visuais não modificam o Fénix."}</span></div>
        {source==="fenix"?<Button variant="ghost" disabled={busy} onClick={sync}><RefreshCw className={busy?"animate-spin":""}/> Atualizar</Button>:<Button variant="ghost" onClick={()=>setDialog(true)}>Importar horário <ArrowUpRight size={16}/></Button>}
      </div>
      <div className="editor-layout">
        <aside className="customizer" aria-label="Personalização do horário">
          <div className="panel-header"><Settings2 size={18}/><h2>Personalizar</h2><Button variant="ghost" size="icon" title="Repor estilo inicial" aria-label="Repor estilo inicial" onClick={()=>{setOptions(DEFAULT_OPTIONS);setCourses(source==="demo"?DEMO_COURSES:coursesFor(lessons));toast.success("Estilo reposto.");}}><RotateCcw size={15}/></Button></div>
          <section className="control-section"><label htmlFor="schedule-title" className="field-label">Título do horário</label><Input id="schedule-title" value={options.title} maxLength={70} onChange={e=>option("title",e.target.value)} placeholder="Horário P1"/></section>
          <section className="control-section"><h3><Palette size={15}/> Estilo de impressão</h3><RadioGroup value={options.theme} onValueChange={v=>option("theme",v as Options["theme"])} className="theme-choices" aria-label="Estilo de impressão">
            {(["soft","outline","mono"] as const).map(theme=><label key={theme} className={"theme-choice "+(options.theme===theme?"selected":"")}><span className={"mini-calendar "+theme}><i/><i/><i/><i/></span><span className="theme-caption"><RadioGroupItem value={theme}/>{themeNames[theme]}</span></label>)}
          </RadioGroup></section>
          <section className="control-section"><div className="section-heading"><h3>Disciplinas</h3><span>{courses.filter(c=>c.visible).length}/{courses.length}</span></div><div className="course-list">{courses.map(c=><div key={c.id} className={"course-row "+(!c.visible?"course-hidden":"")}><Checkbox id={"course-"+c.id} checked={c.visible} onCheckedChange={v=>courseUpdate(c.id,{visible:!!v})} aria-label={"Mostrar "+c.acronym}/><label htmlFor={"course-"+c.id} title={c.name}>{c.acronym}</label><label className="color-well" title={"Cor de "+c.acronym} style={{background:c.color}}><input type="color" value={c.color} onChange={e=>courseUpdate(c.id,{color:e.target.value})} aria-label={"Cor de "+c.acronym}/></label></div>)}</div><p className="control-note">A mesma cor em todas as aulas da disciplina.</p></section>
          <section className="control-section"><h3>No papel</h3>{([["rooms","Salas"],["types","Tipo de aula"],["weeks","Semanas"],["weekend","Fim de semana"]] as const).map(([key,label])=><div className="switch-row" key={key}><label htmlFor={"show-"+key}>{label}</label><Switch id={"show-"+key} checked={options[key]} onCheckedChange={v=>option(key,v)}/></div>)}</section>
          <div className="paper-spec"><span className="paper-spec-icon"><Download size={17}/></span><div><strong>A4 · Horizontal</strong><span>PDF ou PNG · 300 dpi</span></div></div>
        </aside>
        <section className="preview-area" aria-label="Pré-visualização">
          <div className="preview-toolbar"><div className="preview-label"><span className="preview-dot"/><strong>Pré-visualização</strong><span>{visible.length} blocos de aulas</span></div><Select value={week} onValueChange={setWeek}><SelectTrigger className="week-select" aria-label="Semana a visualizar"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas as semanas</SelectItem>{Array.from({length:weekCount},(_,i)=><SelectItem key={i+1} value={String(i+1)}>Semana {i+1}</SelectItem>)}</SelectContent></Select></div>
          <div className="paper-stage">
            {busy?<div className="import-progress" role="status"><LoaderCircle className="animate-spin"/> A importar as tuas aulas…</div>:null}
            <div className="paper-scroll"><div className="paper-preview" dangerouslySetInnerHTML={{__html:svg}}/></div>
            {!visible.length?<div className="empty-hint"><CalendarDays size={22}/><strong>Sem aulas neste intervalo.</strong><span>Revê as datas e as disciplinas selecionadas.</span></div>:null}
          </div>
          <div className="preview-footer"><span><Check size={14}/> Sem rodapés. Só o teu horário.</span><span>As cores e as opções são aplicadas à exportação.</span></div>
          {(hiddenWeekend>0||conflicts>0||narrow)?<div className="calendar-warning" role="status"><AlertTriangle size={17}/><span>{hiddenWeekend>0?hiddenWeekend+" bloco(s) ao fim de semana ocultos. ":""}{conflicts>0?conflicts+" sobreposição(ões) em datas coincidentes. ":""}{narrow?"Há colunas apertadas; seleciona uma semana para melhorar a legibilidade.":""}</span></div>:null}
          <details className="date-settings"><summary>Escolher datas e consultar aulas <span>{from&&to?from+" — "+to:"Selecionar intervalo"}</span></summary><div className="date-fields"><label>Primeiro dia<Input type="date" value={from} onChange={e=>{setFrom(e.target.value);setWeek("all");}}/></label><label>Último dia<Input type="date" value={to} onChange={e=>{setTo(e.target.value);setWeek("all");}}/></label><p>O intervalo define o período a exportar. A semana 1 começa na segunda-feira da primeira data; não representa automaticamente a numeração oficial do Fénix.</p></div>
            {from>to?<p className="error-text">A data final deve ser igual ou posterior à data inicial.</p>:null}
            <ul className="lesson-list">{visible.map(l=><li key={l.id}><strong>{l.acronym}</strong><span>{DAYS[l.day]} · {time(l.start)}–{time(l.end)} · {TYPE_NAMES[l.kind]} · {l.room||"Sem sala"}</span><small>{l.dates.join(", ")}</small></li>)}</ul>
          </details>
        </section>
      </div>
      <footer className="app-footer"><span>Feito para simplificar a vida no Técnico.</span><span>Aplicação independente · Não oficial</span></footer>
    </main>
    <input ref={fileInput} className="sr-only" type="file" accept=".json,application/json" aria-label="Importar calendário JSON do Fénix" onChange={e=>void importJson(e.target.files?.[0])}/>
    <Dialog open={dialog} onOpenChange={setDialog}><DialogContent className="connection-dialog"><DialogHeader><span className="dialog-icon"><Link2 size={25}/></span><DialogTitle>Liga o teu Fénix</DialogTitle><DialogDescription>Importa as aulas em que estás inscrito. A autenticação e a autorização são feitas na página oficial do Técnico.</DialogDescription></DialogHeader>
      <div className="privacy-line"><LockKeyhole size={18}/><p>A aplicação nunca pede a tua palavra-passe do Fénix. Só usa acesso de leitura ao calendário de aulas.</p></div>
      {connection===null?<p role="status">A verificar a configuração…</p>:connection.error?<p className="error-text">{connection.error}</p>:connection.configured?<Button asChild className="fenix-login"><a href="/api/fenix/connect" target="_top">Continuar no Fénix <ArrowUpRight/></a></Button>:<div className="setup-notice"><strong>Falta ativar a ligação ao Fénix</strong><p>O responsável pela aplicação precisa de a registar no Fénix e configurar o Client ID e o Client Secret no servidor. Até lá, podes experimentar o editor e exportar o exemplo.</p><details><summary>Informação para configurar</summary><p>Fénix → Pessoal → Gerir aplicações. Autorizar apenas o acesso ao calendário de aulas.</p><label>URL de redirecionamento</label><code>{connection.callbackUrl||"A definir no servidor"}</code><p>Variáveis: FENIX_CLIENT_ID, FENIX_CLIENT_SECRET, FENIX_REDIRECT_URI e FENIX_COOKIE_SECRET (mínimo 32 caracteres). Não coloques segredos no código do cliente.</p><a href="https://fenixedu.org/dev/tutorials/use-fenixedu-api-in-your-application/" target="_blank" rel="noreferrer">Abrir documentação oficial <ArrowUpRight size={13}/></a></details></div>}
      <div className="json-import"><span>Já tens uma resposta JSON do calendário?</span><Button variant="outline" onClick={()=>fileInput.current?.click()}><Upload/> Importar ficheiro JSON</Button><small>Formato da API /person/calendar/classes?format=json. O ficheiro é processado apenas neste navegador.</small></div>
    </DialogContent></Dialog>
  </div>;
}
