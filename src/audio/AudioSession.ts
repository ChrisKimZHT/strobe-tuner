/** Owns microphone resources and cancels starts that finish after a stop. */
export class AudioSession {
  context?: AudioContext;
  node?: AudioWorkletNode;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private generation = 0;

  async start(
    moduleUrl: string,
    onNode: (node: AudioWorkletNode) => void,
    onState: (state: string) => void,
  ) {
    const closing = this.stop();
    const generation = this.generation;
    await closing;
    if (generation !== this.generation) return;

    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (generation === this.generation) onState('ended');
        };
      });

      await context.audioWorklet.addModule(moduleUrl);
      if (generation !== this.generation) return;
      this.node = new AudioWorkletNode(context, 'strobe-tuner', { outputChannelCount: [1] });
      onNode(this.node);
      this.node.connect(context.destination);
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(this.node);
      context.onstatechange = () => {
        if (generation === this.generation) onState(context.state);
      };
      // Autoplay restrictions can leave resume pending until a user gesture.
      // Request the microphone first and keep the suspended UI usable.
      void context.resume().catch(() => {});
      onState(context.state);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.stop();
      throw error;
    }
  }

  async stop() {
    ++this.generation;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = undefined;
    this.source?.disconnect();
    this.source = undefined;
    if (this.node) {
      this.node.onprocessorerror = null;
      this.node.port.onmessage = null;
      this.node.port.close();
      this.node.disconnect();
    }
    this.node = undefined;
    const context = this.context;
    this.context = undefined;
    if (context) {
      context.onstatechange = null;
      if (context.state !== 'closed') await context.close();
    }
  }
}
