export class AudioSession {
  context?: AudioContext;
  stream?: MediaStream;
  node?: AudioWorkletNode;
  source?: MediaStreamAudioSourceNode;
  private generation = 0;
  async start(test: boolean, moduleUrl: string, onNode: (node: AudioWorkletNode) => void,
    onState: (state: string) => void) {
    const closing = this.stop();
    const generation = this.generation;
    await closing;
    if (generation !== this.generation) return;
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    context.onstatechange = () => { if (generation === this.generation) onState(context.state); };
    try {
      await context.resume();
      if (generation !== this.generation) return;
      if (!test) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
          echoCancellation: false, autoGainControl: false, noiseSuppression: false, channelCount: 1
        } });
        if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
        this.stream = stream;
        stream.getTracks().forEach(t => t.onended = () => {
          if (generation === this.generation) { void this.stop(); onState('ended'); }
        });
      }
      await context.audioWorklet.addModule(moduleUrl);
      if (generation !== this.generation) return;
      this.node = new AudioWorkletNode(context, 'phase-tuner', { outputChannelCount: [1] });
      onNode(this.node);
      this.node.connect(context.destination);
      if (this.stream) {
        this.source = context.createMediaStreamSource(this.stream);
        this.source.connect(this.node);
      }
      onState(context.state);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.stop(); throw error;
    }
  }
  async stop() {
    ++this.generation;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    this.stream = undefined;
    this.source?.disconnect(); this.source = undefined;
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); }
    this.node = undefined;
    const context = this.context; this.context = undefined;
    if (context) { context.onstatechange = null; if (context.state !== 'closed') await context.close(); }
  }
}
