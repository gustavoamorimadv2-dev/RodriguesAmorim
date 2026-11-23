import path from 'node:path';
import {mkdir} from 'node:fs/promises';

// Dedicated private bucket; never use a public Firebase Storage download URL.
export class CloudSessionStore {
  constructor(bucket, dataPath, {fresh=false,onSaved=()=>{}}={}) { this.bucket = bucket; this.dataPath = dataPath; this.fresh=fresh; this.onSaved=onSaved; }
  file(session) {
    if (!/^RemoteAuth-[\w-]+$/.test(session)) throw new Error('Invalid session name');
    return this.bucket.file(`sessions/${session}.zip`);
  }
  async sessionExists({session}) { const file=this.file(session); return this.fresh ? false : (await file.exists())[0]; }
  async save({session}) {
    await this.bucket.upload(path.resolve(this.dataPath,`${session}.zip`),{
      destination:this.file(session).name,
      resumable:false,
      metadata:{cacheControl:'no-store',contentType:'application/zip'}
    });
    this.fresh=false;
    this.onSaved();
  }
  async extract({session,path:destination}) {
    const file=this.file(session);
    // Cloud Run starts with an empty temporary filesystem on every new instance.
    await mkdir(path.dirname(destination),{recursive:true});
    await file.download({destination});
  }
  async delete({session}) { const file=this.file(session); if(!this.fresh) await file.delete({ignoreNotFound:true}); }
}
