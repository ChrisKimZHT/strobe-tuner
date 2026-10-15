import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioSession } from '../src/session.ts';

test('stop releases tracks; repeated start closes previous chain; permission race releases late stream', async () => {
  let created=0,closed=0,stopped=0,disconnected=0;
  class Context {
    state='suspended'; onstatechange: unknown; destination={};
    audioWorklet={addModule:async()=>{}};
    constructor(){created++;}
    async resume(){this.state='running';}
    async close(){this.state='closed';closed++;}
    createMediaStreamSource(){return {connect(){},disconnect(){disconnected++;}};}
  }
  class Worklet { port={onmessage:null,close(){}}; connect(){} disconnect(){} }
  const track={stop(){stopped++;},onended:null};
  const stream={getTracks:()=>[track]};
  const originalContext=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
  const originalNode=Object.getOwnPropertyDescriptor(globalThis,'AudioWorkletNode');
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'AudioContext',{value:Context,configurable:true});
  Object.defineProperty(globalThis,'AudioWorkletNode',{value:Worklet,configurable:true});
  let getMedia=async()=>stream;
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>getMedia()}},configurable:true});
  try {
    const session=new AudioSession();
    await session.start(false,'test',()=>{},()=>{});
    await session.start(false,'test',()=>{},()=>{});
    assert.equal(created,2); assert.equal(closed,1); assert.equal(stopped,1);
    await session.stop(); assert.equal(closed,2); assert.equal(stopped,2); assert.equal(disconnected,2);
    let release!:(value:typeof stream)=>void;
    getMedia=()=>new Promise(resolve=>{release=resolve;});
    const pending=session.start(false,'test',()=>assert.fail('cancelled start created a node'),()=>{});
    await new Promise(resolve=>setTimeout(resolve,0));
    await session.stop(); release(stream); await pending;
    assert.equal(stopped,3); assert.equal(closed,3); assert.equal(session.node,undefined);
  } finally {
    for(const [key,descriptor] of [['AudioContext',originalContext],['AudioWorkletNode',originalNode],['navigator',originalNavigator]] as const) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor); else Reflect.deleteProperty(globalThis,key);
    }
  }
});
