import { remoteEnabled } from '@/lib/server/supabase';
import { cloudHealth } from '@/lib/server/cloud-api';
import { db } from '@/lib/server/store';
import { handle, origin, response } from '@/lib/server/http';
export const runtime='nodejs';
export const maxDuration=30;
export const dynamic='force-dynamic';
export function GET() { if(remoteEnabled())return cloudHealth();return handle(()=>{origin();db().prepare('SELECT 1').get();return response({ok:true});}); }
