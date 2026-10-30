import {expect,it} from 'vitest';
import {needsUpload,nextCheck,TWO_DAYS} from './schedule';
import {newNote} from './workspace';
import {DEFAULT_REPO,encodeNote} from './github';
it('persists a two-day deadline and keeps overdue checks due after reopening',()=>{
 const now=100000;
 expect(nextCheck(null,now)).toBe(now+TWO_DAYS);
 expect(nextCheck('NaN',now)).toBe(now+TWO_DAYS);
 expect(nextCheck('50000',now)).toBe(50000);
});
it('detects new notes, title and tag edits, and deletion records for previously synced notes',()=>{
 const n=newNote();expect(needsUpload(n)).toBe(true);
 n.github={url:DEFAULT_REPO,branch:'main',path:'notes/a.md',sha:'a'.repeat(40),format:'md',syncedAt:n.updatedAt,baseContent:n.content,baseSnapshot:encodeNote(n)};
 expect(needsUpload(n)).toBe(false);
 n.title='changed';expect(needsUpload(n)).toBe(true);
 n.github.baseSnapshot=encodeNote(n);n.tags=['new'];expect(needsUpload(n)).toBe(true);
 n.deletedAt=new Date().toISOString();expect(needsUpload(n)).toBe(true);
 n.github.baseSnapshot=encodeNote(n);expect(needsUpload(n)).toBe(false);
 n.deletedAt=null;expect(needsUpload(n)).toBe(true);
});
it('does not re-upload legacy unchanged imports merely because fetching took time',()=>{
 const n=newNote();n.sourceUrl=DEFAULT_REPO+'/blob/main/a.md';
 n.github={url:DEFAULT_REPO,branch:'main',path:'a.md',sha:'a'.repeat(40),format:'md',syncedAt:'2020-01-01T00:00:00.000Z',baseContent:n.content};
 expect(needsUpload(n)).toBe(false);n.content='changed';expect(needsUpload(n)).toBe(true);
});

it("does not upload deletion of a never-published local note",()=>{const n=newNote();n.deletedAt=new Date().toISOString();expect(needsUpload(n)).toBe(false);});

import {needsDeletionSync} from './schedule';
it('only requires deletion sync for a cloud binding, never for import provenance alone',()=>{
 const n={...newNote(),deletedAt:new Date().toISOString(),sourceUrl:'https://github.com/other/questions/blob/main/a.md',source:{url:'https://github.com/other/questions',branch:'main',path:'a.md',sha:'a'.repeat(40),baseContent:''}};
 expect(needsDeletionSync(n)).toBe(false);expect(needsUpload(n)).toBe(false);
 const published={...n,github:{url:DEFAULT_REPO,branch:'main',path:'a.md',sha:'a'.repeat(40),format:'md' as const,transport:'manifest' as const,syncedAt:n.updatedAt,baseSnapshot:encodeNote({...n,deletedAt:null})}};
 expect(needsDeletionSync(published)).toBe(true);
 published.github.baseSnapshot=encodeNote(published);expect(needsDeletionSync(published)).toBe(false);
});
