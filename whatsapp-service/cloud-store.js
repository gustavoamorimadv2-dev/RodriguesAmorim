import path from 'node:path';

// Dedicated private bucket; never use a public Firebase Storage download URL.
export class CloudSessionStore {
  constructor(bucket, dataPath) { this.bucket = bucket; this.dataPath = dataPath; }
  file(session) {
    if (!/^RemoteAuth-[\w-]+$/.test(session)) throw new Error('Invalid session name');
    return this.bucket.file(`sessions/${session}.zip`);
  }
  async sessionExists({session}) { return (await this.file(session).exists())[0]; }
  async save({session}) {
    await this.bucket.upload(path.resolve(this.dataPath,`${session}.zip`),{
      destination:this.file(session).name,
      resumable:false,
      metadata:{cacheControl:'no-store',contentType:'application/zip'}
    });
  }
  async extract({session,path:destination}) { await this.file(session).download({destination}); }
  async delete({session}) { await this.file(session).delete({ignoreNotFound:true}); }
}
