'use client';
import {FormEvent,useState} from 'react';
import {mensagemErro} from '../lib/supabase';
export type Row = Record<string,any>;
export type Field={name:string;label:string;type?:string;required?:boolean;options?:{value:string|number;label:string}[];min?:string;step?:string;maxLength?:number};
export default function Editor({title,fields,initial={},onSave,onCancel}:{title:string;fields:Field[];initial?:Row;onSave:(data:Row)=>Promise<void>;onCancel:()=>void}) {
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const data:Row={};fields.forEach(field=>{const v=String(f.get(field.name)||'').trim();data[field.name]=v===''?null:field.type==='number'||field.name.endsWith('_id')?Number(v):v;});setBusy(true);setError('');try{await onSave(data);onCancel();}catch(e){setError(mensagemErro(e));}finally{setBusy(false);}}
 return <section className="panel editor"><div className="section-heading"><h2>{title}</h2><button className="secondary" disabled={busy} onClick={onCancel}>Cancelar</button></div><form onSubmit={save}><div className="form-grid">{fields.map(f=><label key={f.name}>{f.label}{f.required?' *':''}{f.options?<select name={f.name} required={f.required} defaultValue={initial[f.name]??''}><option value="">Selecione</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==='textarea'?<textarea name={f.name} defaultValue={initial[f.name]??''} maxLength={4000}/>:<input name={f.name} type={f.type||'text'} required={f.required} defaultValue={initial[f.name]??''} min={f.min} step={f.step} maxLength={f.maxLength??200}/>}</label>)}</div>{error&&<p className="alert error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar'}</button></form></section>;
}
