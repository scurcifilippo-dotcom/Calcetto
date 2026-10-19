import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive=promisify(scrypt);
export async function hash(password:string) { const salt=randomBytes(16).toString('hex');const key=await derive(password,salt,64) as Buffer;return `${salt}:${key.toString('hex')}`; }
export async function verify(password:string,stored:string) { const [salt,hex]=stored.split(':');const actual=await derive(password,salt,64) as Buffer;const expected=Buffer.from(hex,'hex');return expected.length===actual.length && timingSafeEqual(expected,actual); }
const dummySalt='00000000000000000000000000000000';
export async function verifyDummy(password:string) { await derive(password,dummySalt,64);return false; }
