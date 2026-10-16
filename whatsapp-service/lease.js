export class SessionLease {
  constructor(ref,owner,{now=()=>Date.now(),ttl=90_000}={}) {
    this.ref=ref;this.owner=owner;this.now=now;this.ttl=ttl;this.until=0;
  }
  valid() { return this.until>this.now()+15_000; }
  async acquire() {
    const now=this.now();
    const until=await this.ref.firestore.runTransaction(async tx=>{
      const previous=(await tx.get(this.ref)).data();
      if(previous && previous.owner!==this.owner && previous.until>now) return 0;
      tx.set(this.ref,{owner:this.owner,until:now+this.ttl});
      return now+this.ttl;
    });
    this.until=until;return this.valid();
  }
  async release() {
    this.until=0;
    await this.ref.firestore.runTransaction(async tx=>{
      const previous=(await tx.get(this.ref)).data();
      if(previous?.owner===this.owner) tx.delete(this.ref);
    });
  }
}
