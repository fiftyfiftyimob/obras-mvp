'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {supabase} from '../lib/supabase';
export default function Page(){const router=useRouter();useEffect(()=>{supabase.auth.getSession().then(({data})=>router.replace(data.session?'/obras':'/login'));},[router]);return <main className="loading">Abrindo suas obras…</main>;}
