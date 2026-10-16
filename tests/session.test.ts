import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioSession } from '../src/audio/AudioSession.ts';

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
    await session.start('worklet',()=>{},()=>{});
    await session.start('worklet',()=>{},()=>{});
    assert.equal(created,2); assert.equal(closed,1); assert.equal(stopped,1);
    await session.stop(); assert.equal(closed,2); assert.equal(stopped,2); assert.equal(disconnected,2);
    let release!:(value:typeof stream)=>void;
    getMedia=()=>new Promise(resolve=>{release=resolve;});
    const pending=session.start('worklet',()=>assert.fail('cancelled start created a node'),()=>{});
    await new Promise(resolve=>setTimeout(resolve,0));
    await session.stop(); release(stream); await pending;
    assert.equal(stopped,3); assert.equal(closed,3); assert.equal(session.node,undefined);
  } finally {
    for(const [key,descriptor] of [['AudioContext',originalContext],['AudioWorkletNode',originalNode],['navigator',originalNavigator]] as const) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor); else Reflect.deleteProperty(globalThis,key);
    }
  }
});

test('autoplay restrictions do not block microphone access or suspended state', { timeout: 2000 }, async () => {
  let mediaRequests = 0;
  let stopped = false;
  class Context {
    state = 'suspended';
    onstatechange: unknown;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    resume() { return new Promise<void>(() => {}); }
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  }
  class Worklet {
    port = { onmessage: null, close() {} };
    connect() {}
    disconnect() {}
  }
  const originals = ['AudioContext', 'AudioWorkletNode', 'navigator'].map((key) => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ] as const);
  const track = { onended: null, stop() { stopped = true; } };
  let denyPermission = false;
  Object.defineProperty(globalThis, 'AudioContext', { value: Context, configurable: true });
  Object.defineProperty(globalThis, 'AudioWorkletNode', { value: Worklet, configurable: true });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => {
      mediaRequests++;
      if (denyPermission) throw new DOMException('Permission denied', 'NotAllowedError');
      return { getTracks: () => [track] };
    } } },
  });
  const session = new AudioSession();
  try {
    const states: string[] = [];
    await session.start('worklet', () => {}, (state) => states.push(state));
    assert.equal(mediaRequests, 1);
    assert.deepEqual(states, ['suspended']);
    assert.ok(session.node);
    const context = session.context;
    await session.stop();
    assert.equal(context?.state, 'closed');
    assert.equal(stopped, true);

    denyPermission = true;
    await assert.rejects(session.start('worklet', () => assert.fail('permission denied'), () => {}), { name: 'NotAllowedError' });
    assert.equal(mediaRequests, 2);
    assert.equal(session.context, undefined);
  } finally {
    await session.stop();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
