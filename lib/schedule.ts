export type Lesson = { id: string; courseId: string; acronym: string; name: string; kind: string; room: string; day: number; start: number; end: number; dates: string[]; weeks: number[] };
export type Course = { id: string; acronym: string; name: string; color: string; visible: boolean };
export type Options = { title: string; theme: "soft" | "outline" | "mono"; rooms: boolean; types: boolean; weeks: boolean; weekend: boolean };
export const PALETTE = ["#008e89", "#d18709", "#3e9356", "#3975c6", "#8252b0", "#d55e62", "#45789c", "#867132"];
export const DEFAULT_OPTIONS: Options = { title: "Horário P1", theme: "soft", rooms: true, types: true, weeks: true, weekend: false };
export const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export const TYPE_NAMES: Record<string, string> = { T: "Teórica", LAB: "Laboratório", PB: "Problemas", TP: "Teórico-prática", S: "Seminário", O: "Outra aula" };
export const time = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
export function monday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function weekNumber(date: string, anchor: string) { return Math.floor((Date.parse(date + "T12:00:00Z") - Date.parse(monday(anchor) + "T12:00:00Z")) / 604800000) + 1; }
export function compactWeeks(weeks: number[]) {
  const values = [...new Set(weeks)].sort((a, b) => a - b), parts: string[] = [];
  for (let i = 0; i < values.length; i++) { let j = i; while (values[j + 1] === values[j] + 1) j++; parts.push(j > i ? values[i]+"-"+values[j] : String(values[i])); i = j; }
  return parts.join(", ");
}
export function coursesFor(lessons: Lesson[]): Course[] {
  const map = new Map<string, Course>();
  lessons.forEach(l => { if (!map.has(l.courseId)) map.set(l.courseId, { id: l.courseId, acronym: l.acronym, name: l.name, color: PALETTE[map.size % PALETTE.length], visible: true }); });
  return [...map.values()];
}
const demoRows: [number, number, number, string, string, string, number[]][] = [
  [0,570,660,"OC","LAB","F2",[1,2,3,4,6]], [0,660,720,"OC","T","GA1",[1,2,3,4,6]], [0,810,930,"RC","T","GA3",[1,2,3,4,6]],
  [1,480,600,"Mod","T","VA3",[1,2,3,4,5,6]], [1,600,660,"OC","T","GA1",[1,2,3,4,5,6]], [1,690,780,"RC","LAB","LT5",[1,2,3,4,5,6]],
  [2,480,570,"Mod","LAB","F2",[1,2,3,4,5,6]], [2,570,630,"Apre","T","VA4",[1,2,3,4,5,6]],
  [3,480,540,"Apre","T","QA02.1",[1,2,3,4,5,6]], [3,540,630,"Apre","LAB","Q4.7",[1,2,3,4,5,6]],
  [4,780,900,"IJE","T","E4",[1,2,3,4,5,6]], [4,900,990,"IJE","PB","E5",[1,2,3,4,5,6]],
];
export const DEMO_LESSONS: Lesson[] = demoRows.map(([day,start,end,acronym,kind,room,weeks],i) => ({id:"demo-"+i, courseId:acronym,acronym,name:acronym,kind,room,day,start,end,weeks, dates:weeks.map(w=>addDays("2026-09-07",(w-1)*7+day))}));
export const DEMO_COURSES = coursesFor(DEMO_LESSONS).map(c=>({...c,color:({OC:PALETTE[0],Mod:PALETTE[1],Apre:PALETTE[2],RC:PALETTE[3],IJE:PALETTE[4]} as Record<string,string>)[c.id]}));

function parseDateTime(value: unknown): { date: string; minutes: number; day: number } | null {
  if (typeof value !== "string") return null;
  // Fénix returns local Europe/Lisbon wall-clock times, not UTC timestamps.
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [,dd,mm,yyyy,hh,min] = m, date = yyyy+"-"+mm+"-"+dd;
  const d = new Date(date + "T12:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== date || +hh > 23 || +min > 59) return null;
  return {date, minutes:+hh*60 + +min, day:(d.getUTCDay()+6)%7};
}
export function parseFenix(payload: unknown): {lessons: Lesson[]; academicTerm: string; skipped: number} {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as {events:unknown}).events)) throw new Error("A resposta do Fénix não contém um calendário válido.");
  const data = payload as {events: unknown[]; academicTerm?: string};
  if (data.events.length > 20000) throw new Error("O calendário é demasiado grande.");
  const groups = new Map<string,Lesson>(); let skipped=0;
  for (const raw of data.events) {
    if (!raw || typeof raw !== "object") {skipped++;continue;}
    const e = raw as {classPeriod?:{start:unknown;end:unknown};course?:{id?:string;acronym?:string;name?:string};title?:string;location?:{name?:string}[]};
    const start=parseDateTime(e.classPeriod?.start),end=parseDateTime(e.classPeriod?.end);
    if (!start||!end||start.date!==end.date||end.minutes<=start.minutes||!e.course) {skipped++;continue;}
    const courseId=String(e.course.id||e.course.acronym||e.course.name||"").slice(0,120);
    if (!courseId) {skipped++;continue;}
    const title=String(e.title||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const kind=title.includes("laborat")?"LAB":title.includes("problema")?"PB":/teoric[ao][ -]*pratic/.test(title)?"TP":title.includes("teoric")?"T":title.includes("seminar")?"S":"O";
    const room=(Array.isArray(e.location)?e.location.map(r=>String(r?.name||"")).filter(Boolean).join(", "):"").slice(0,120);
    const key=JSON.stringify([courseId,kind,room,start.day,start.minutes,end.minutes]);
    const existing=groups.get(key);
    if(existing) {if(!existing.dates.includes(start.date)) existing.dates.push(start.date);}
    else groups.set(key,{id:"lesson-"+groups.size,courseId,acronym:String(e.course.acronym||e.course.name||"UC").slice(0,50),name:String(e.course.name||e.course.acronym||"Unidade curricular").slice(0,200),kind,room,day:start.day,start:start.minutes,end:end.minutes,dates:[start.date],weeks:[]});
  }
  const lessons=[...groups.values()]; const anchor=lessons.flatMap(l=>l.dates).sort()[0];
  lessons.forEach(l=>{l.dates.sort();l.weeks=l.dates.map(d=>weekNumber(d,anchor));});
  return {lessons,academicTerm:String(data.academicTerm||"").slice(0,80),skipped};
}
export function filterLessons(lessons: Lesson[], from: string, to: string, week: string) {
  if(!from||!to||from>to) return [];
  return lessons.map(l=>{ const dates=l.dates.filter(d=>d>=from&&d<=to&&(week==="all"||weekNumber(d,from)===+week)); return {...l, dates,weeks:[...new Set(dates.map(d=>weekNumber(d,from)))]}; }).filter(l=>l.dates.length);
}
export type Positioned = Lesson & {lane:number;lanes:number};
export function positionLessons(lessons: Lesson[]): Positioned[] {
  const result:Positioned[]=[];
  for(let day=0;day<7;day++) {
    const items=lessons.filter(l=>l.day===day).sort((a,b)=>a.start-b.start||b.end-a.end);
    let cluster:Positioned[]=[],ends:number[]=[],clusterEnd=-1;
    const flush=()=>{cluster.forEach(l=>{l.lanes=ends.length;result.push(l);});cluster=[];ends=[];};
    for(const l of items) {
      if(l.start>=clusterEnd) flush();
      let lane=ends.findIndex(end=>end<=l.start);if(lane<0)lane=ends.length;
      ends[lane]=l.end;clusterEnd=cluster.length?Math.max(clusterEnd,l.end):l.end;
      cluster.push({...l,lane,lanes:1});
    } flush();
  } return result;
}
export function conflictCount(lessons: Lesson[]) {
  let n=0;for(let i=0;i<lessons.length;i++)for(let j=i+1;j<lessons.length;j++) {const a=lessons[i],b=lessons[j];if(a.day===b.day&&a.start<b.end&&b.start<a.end&&a.dates.some(d=>b.dates.includes(d)))n++;}return n;
}
