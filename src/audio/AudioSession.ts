/** Owns audio input resources and cancels starts that finish after a stop. */
export class AudioSession {
  context?: AudioContext;
  node?: AudioWorkletNode;
  private stream?: MediaStream;
  private source?: AudioNode;
  private oscillator?: OscillatorNode;
  private generation = 0;

  async start(
    moduleUrl: string,
    onNode: (node: AudioWorkletNode) => void,
    onState: (state: string) => void,
    toneHz?: number,
  ) {
    const closing = this.stop();
    const generation = this.generation;
    await closing;
    if (generation !== this.generation) return;

    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    try {
      if (toneHz === undefined) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, channelCount: { ideal: 2 } },
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
      } else if (!Number.isFinite(toneHz) || toneHz <= 0 || toneHz >= context.sampleRate / 2) {
        throw new RangeError(`Hz must be greater than 0 and below ${context.sampleRate / 2}.`);
      }

      await context.audioWorklet.addModule(moduleUrl);
      if (generation !== this.generation) return;
      this.node = new AudioWorkletNode(context, 'strobe-tuner', {
        outputChannelCount: [1], channelCount: 2, channelCountMode: 'clamped-max', channelInterpretation: 'discrete',
      });
      onNode(this.node);
      this.node.connect(context.destination);
      if (this.stream) {
        this.source = context.createMediaStreamSource(this.stream);
        this.source.connect(this.node);
      } else if (toneHz !== undefined) {
        const gain = context.createGain();
        gain.gain.value = 0.3;
        this.source = gain;
        gain.connect(this.node);
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = toneHz;
        oscillator.connect(gain);
        oscillator.start();
        this.oscillator = oscillator;
      }
      context.onstatechange = () => {
        if (generation === this.generation) onState(context.state);
      };
      // Autoplay restrictions can leave resume pending until a user gesture.
      // Set up the input first and keep the suspended UI usable.
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
    this.oscillator?.stop();
    this.oscillator?.disconnect();
    this.oscillator = undefined;
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
