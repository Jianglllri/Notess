/** At most one write in flight and one latest snapshot waiting. */
export class LatestSaveQueue<T> {
  private pending:T|undefined;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private running=false;
  private stopped=false;
  constructor(private write:(value:T)=>Promise<void>,private saved:()=>void,private failed:(error:unknown)=>void,private delay=250){}
  get idle(){return !this.running && this.pending===undefined && !this.stopped;}
  enqueue(value:T){this.pending=value;if(this.stopped)return;clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),this.delay);}
  retry(value:T){this.stopped=false;this.enqueue(value);}
  async flush(){
    clearTimeout(this.timer);
    if(this.running||this.stopped||this.pending===undefined)return;
    this.running=true;
    try{
      while(this.pending!==undefined&&!this.stopped){const next=this.pending;this.pending=undefined;await this.write(next);}
      if(!this.stopped)this.saved();
    }catch(error){this.stopped=true;this.failed(error);}
    finally{this.running=false;}
  }
}
