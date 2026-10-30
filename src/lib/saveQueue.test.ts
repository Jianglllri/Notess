import {it,expect,vi,afterEach} from 'vitest';
import {LatestSaveQueue} from './saveQueue';
import {createWorkspace,validateWorkspace} from './workspace';
import {editContent,rememberWorkspaceSize} from './editContent';
afterEach(()=>vi.useRealTimers());
it('coalesces slow saves into only the latest pending snapshot',async()=>{
 vi.useFakeTimers();let finish!:()=>void;const writes:number[]=[];
 const queue=new LatestSaveQueue<number>(async n=>{writes.push(n);if(n===1)await new Promise<void>(r=>finish=r);},()=>{},()=>{});
 queue.enqueue(1);await vi.advanceTimersByTimeAsync(250);
 for(let i=2;i<=100;i++)queue.enqueue(i);
 await vi.advanceTimersByTimeAsync(250);expect(writes).toEqual([1]);finish();await vi.advanceTimersByTimeAsync(0);expect(writes).toEqual([1,100]);
});
it('stops on conflicts and retries the newest snapshot explicitly',async()=>{
 const saved=vi.fn(),failure=vi.fn(),write=vi.fn().mockRejectedValueOnce(Error('conflict')).mockResolvedValue(undefined);
 const queue=new LatestSaveQueue<number>(write,saved,failure);queue.enqueue(1);await queue.flush();queue.enqueue(2);await queue.flush();expect(write).toHaveBeenCalledTimes(1);
 queue.retry(3);await queue.flush();expect(write).toHaveBeenLastCalledWith(3);expect(saved).toHaveBeenCalledTimes(1);
});
it('edits preserve untouched identities and reject oversized content before mutation',()=>{
 const w=rememberWorkspaceSize(validateWorkspace(createWorkspace()));const next=editContent(w,w.notes[0].id,'中文 😀');
 expect(next.notes[1]).toBe(w.notes[1]);expect(next.folders).toBe(w.folders);expect(validateWorkspace(next).notes[0].content).toBe('中文 😀');
 expect(()=>editContent(next,w.notes[0].id,'x'.repeat(1_000_001))).toThrow();expect(next.notes[0].content).toBe('中文 😀');
});
