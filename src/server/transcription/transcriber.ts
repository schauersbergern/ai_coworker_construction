export interface Transcriber {
  /** Transkribiert die Audiodatei am absoluten Pfad und liefert den Text. */
  transcribe(audioAbsPath: string): Promise<string>;
}

/** Test-Implementierung: deterministisch, ohne externe Abhängigkeiten. */
export class FakeTranscriber implements Transcriber {
  constructor(private readonly result: string = "Transkript (Fake)") {}
  async transcribe(_audioAbsPath: string): Promise<string> {
    return this.result;
  }
}
