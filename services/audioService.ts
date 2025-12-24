
class AudioService {
  private themeAudio: HTMLAudioElement;
  private correctAudio: HTMLAudioElement;
  private incorrectAudio: HTMLAudioElement;
  private buzzAudio: AudioContext | null = null; // Sticking to generated buzz for low latency, or use file if desired

  constructor() {
    this.themeAudio = new Audio('/music/jeopardy_theme.mp3');
    this.correctAudio = new Audio('/music/correct_sound.mp3');
    this.incorrectAudio = new Audio('/music/incorrect_sound.mp3');

    // Preload
    this.themeAudio.load();
    this.correctAudio.load();
    this.incorrectAudio.load();
  }

  playTheme() {
    try {
      this.themeAudio.currentTime = 1.5;
      this.themeAudio.play().catch(e => console.warn("Theme play failed:", e));
    } catch (e) {
      console.warn("Theme play error:", e);
    }
  }

  stopTheme() {
    try {
      this.themeAudio.pause();
      this.themeAudio.currentTime = 0;
    } catch (e) {
      console.warn("Theme stop error:", e);
    }
  }

  playCorrect() {
    try {
      this.stopTheme();
      this.correctAudio.currentTime = 0;
      this.correctAudio.play().catch(e => console.warn("Correct play failed:", e));
    } catch (e) {
      console.warn("Correct play error:", e);
    }
  }

  playIncorrect() {
    try {
      this.stopTheme();
      this.incorrectAudio.currentTime = 0;
      this.incorrectAudio.play().catch(e => console.warn("Incorrect play failed:", e));
    } catch (e) {
      console.warn("Incorrect play error:", e);
    }
  }

  playTimeout() {
    // A generated "Time's Up" sound (descending tones)
    this.initAudioContext();
    if (!this.buzzAudio) return;

    const now = this.buzzAudio.currentTime;
    const osc = this.buzzAudio.createOscillator();
    const gain = this.buzzAudio.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);

    osc.connect(gain);
    gain.connect(this.buzzAudio.destination);

    osc.start();
    osc.stop(now + 0.5);
  }

  // Keeping generated buzz for immediate feedback
  playBuzz() {
    this.initAudioContext();
    if (!this.buzzAudio) return;

    const osc = this.buzzAudio.createOscillator();
    const gain = this.buzzAudio.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.buzzAudio.currentTime);

    gain.gain.setValueAtTime(0.1, this.buzzAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, this.buzzAudio.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.buzzAudio.destination);

    osc.start();
    osc.stop(this.buzzAudio.currentTime + 0.5);
  }

  // Renamed for clarity based on user request "make the music only play... with a 30 second timer"
  // We'll treat the "Theme" as the "Think Music" for questions.
  playThinkMusic() {
    this.playTheme();
  }

  stopThinkMusic() {
    this.stopTheme();
  }

  private initAudioContext() {
    if (!this.buzzAudio) {
      this.buzzAudio = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }
}

export const audioService = new AudioService();
