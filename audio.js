/** Project-owner licensed Home Workout media plus independent alternative cues. */
export const SOUND_NAMES=Object.freeze(['tick','ready','start','rest','finish']);
export const SOUND_MODES=Object.freeze(['reference','original']);
const SOURCES=Object.freeze({
 reference:{tick:'media/audio/tick.mp3',ready:'media/audio/whistle.wav',start:'media/audio/ding.mp3',rest:'media/audio/whistle.wav',finish:'media/audio/cheer.mp3'},
 original:{tick:'sounds/tick.wav',ready:'sounds/ready.wav',start:'sounds/start.wav',rest:'sounds/rest.wav',finish:'sounds/finish.wav'}
});
const pool=new Map();
function load(name,mode){if(!SOUND_NAMES.includes(name))return null;const pack=SOURCES[mode]||SOURCES.reference;const src=pack[name];if(!pool.has(src)){const a=new Audio(new URL(src,import.meta.url).href);a.preload='auto';pool.set(src,a)}return pool.get(src)}
export function warmSounds(mode='reference'){if(typeof Audio==='undefined')return;for(const name of SOUND_NAMES)load(name,mode)}
export function playSound(name,settings={}){
 if(!settings.effects||settings.volume<=0)return;
 const a=load(name,settings.soundPack||'reference');if(!a)return;
 try{const instance=a.paused?a:a.cloneNode();instance.currentTime=0;instance.volume=Math.min(1,Math.max(0,Number(settings.volume)||0));const attempt=instance.play();attempt?.catch?.(()=>{})}catch{}
}
export function stopSounds(){for(const a of pool.values()){try{a.pause();a.currentTime=0}catch{}}}
