/** Independent elapsed-time workout engine. No Android code reused. */
export class WorkoutEngine {
 constructor({clock=()=>performance.now(),onChange=()=>{},save=()=>{},record=()=>{}}={}){Object.assign(this,{clock,onChange,save,record});this.state='IDLE';this.session=null;this.mark=clock();}
 start({steps,programId,dayId,preview=false,readySeconds=15,restSeconds=25,reviewed=false,contentReady=false}){
  if(!preview&&!reviewed&&!contentReady)throw Error('Each exercise needs licensed demonstration media and usable guidance before tracking can start.');
  if(this.session&&!['IDLE','COMPLETED'].includes(this.state))throw Error('A session is already open.');
  if(!steps.length||steps.some(s=>!['timed','reps'].includes(s.mode)||!Number.isFinite(+s.value)||+s.value<=0))throw Error('Invalid or unverified routine steps.');
  this.session={id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,programId,dayId,preview,steps:structuredClone(steps),index:0,results:{},activeMs:0,startedAt:new Date().toISOString(),defaultRest:restSeconds};
  this.setPhase('READY',readySeconds*1000);this.emit();
 }
 get step(){return this.session?.steps[this.session.index];}
 get remaining(){return Math.max(0,this.left??0);}
 setPhase(state,ms=null){this.state=state;this.left=ms;this.phaseTotal=ms;this.mark=this.clock();}
 emit(){this.save(this.snapshot());this.onChange(this);}
 tick(){
  const now=this.clock(),delta=Math.max(0,now-this.mark);this.mark=now;
  if(!this.session||!['READY','EXERCISE','REST'].includes(this.state))return;
  if(this.state==='EXERCISE')this.session.activeMs+=this.left==null?delta:Math.min(delta,this.remaining);
  if(this.left==null)return;
  this.left=Math.max(0,this.left-delta);
  if(this.left===0){
   if(this.state==='READY'||this.state==='REST')this.beginExercise();
   else this.advance(true);
  }
 }
 beginExercise(){this.setPhase('EXERCISE',this.step.mode==='timed'?this.step.value*1000:null);this.emit();}
 advance(done=false){
  if(this.state!=='EXERCISE')return;
  this.session.results[this.session.index]=done?'done':'skipped';
  if(this.session.index===this.session.steps.length-1){this.complete();return;}
  const rest=this.step.restSeconds??this.session.defaultRest;
  this.session.index++;this.setPhase('REST',rest*1000);this.emit();
  if(rest===0)this.beginExercise();
 }
 done(){if(this.state==='EXERCISE'&&this.step.mode==='reps'){this.tick();this.advance(true);}}
 next(){if(this.state==='EXERCISE'){this.tick();if(this.state==='EXERCISE')this.advance(false);}}
 previous(){
  if(!this.session||!['READY','EXERCISE','REST'].includes(this.state)||this.session.index===0)return;
  this.tick();if(this.state==='COMPLETED')return;this.session.index--;for(const key of Object.keys(this.session.results))if(+key>=this.session.index)delete this.session.results[key];
  this.beginExercise();
 }
 pause(kind='PAUSED'){
  if(!['READY','EXERCISE','REST'].includes(this.state))return;
  this.tick();if(!['READY','EXERCISE','REST'].includes(this.state))return;
  this.resumeState=this.state;this.resumeTotal=this.phaseTotal;this.setPhase(kind,this.left);this.phaseTotal=this.resumeTotal;this.emit();
 }
 resume(){if(!['PAUSED','INTERRUPTED'].includes(this.state))return;this.setPhase(this.resumeState,this.left);this.phaseTotal=this.resumeTotal??this.phaseTotal;this.emit();}
 skipRest(){if(this.state==='REST')this.beginExercise();}
 skipReady(){if(this.state==='READY')this.beginExercise();}
 addRest(seconds=20){if(this.state!=='REST')return;this.tick();if(this.state==='REST'){this.left+=seconds*1000;this.phaseTotal=(this.phaseTotal??0)+seconds*1000;this.emit();}}
 editRest(seconds){if(this.state==='REST'&&Number.isFinite(seconds)&&seconds>=1&&seconds<=600){this.left=seconds*1000;this.phaseTotal=seconds*1000;this.mark=this.clock();this.emit();}}
 requestExit(){
  if(!this.session||['COMPLETED','IDLE','EXIT_CONFIRMATION'].includes(this.state))return;
  this.exitWasPaused=['PAUSED','INTERRUPTED'].includes(this.state)?this.state:null;
  if(!this.exitWasPaused)this.pause();
  if(this.state==='COMPLETED')return;
  this.state='EXIT_CONFIRMATION';this.emit();
 }
 cancelExit(){if(this.state!=='EXIT_CONFIRMATION')return;this.state=this.exitWasPaused||'PAUSED';if(!this.exitWasPaused)this.resume();else this.emit();}
 confirmExit(){if(this.state!=='EXIT_CONFIRMATION')return;this.state='IDLE';this.session=null;this.emit();}
 interrupt(){this.pause('INTERRUPTED');}
 complete(){
  if(this.state==='COMPLETED')return;
  const allDone=this.session.steps.every((_,i)=>this.session.results[i]==='done');
  this.session.completed=allDone;this.session.finishedAt=new Date().toISOString();this.setPhase('COMPLETED');
  if(!this.session.preview)this.record(structuredClone(this.session));this.emit();
 }
 snapshot(){return this.session?{version:1,state:this.state,left:this.left,phaseTotal:this.phaseTotal,resumeTotal:this.resumeTotal,resumeState:this.resumeState,session:this.session}:null;}
 restore(data){
  if(!data||data.version!==1||!data.session||!Array.isArray(data.session.steps))return false;
  if(data.state==='COMPLETED')return false;
  this.session=data.session;this.left=data.left;this.phaseTotal=data.phaseTotal??data.left;this.resumeTotal=data.resumeTotal??this.phaseTotal;
  this.resumeState=['READY','EXERCISE','REST'].includes(data.state)?data.state:data.resumeState;
  if(!['READY','EXERCISE','REST'].includes(this.resumeState)){this.session=null;return false;}
  this.state='INTERRUPTED';this.mark=this.clock();this.emit();return true;
 }
}
