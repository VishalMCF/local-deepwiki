import { Subject } from 'rxjs';

export interface LiveEvent {
  type: 'tool' | 'text' | 'thinking' | 'done' | 'error';
  [k: string]: any;
}

/**
 * Buffers an in-flight answer so a client that connects to the SSE stream after
 * the run started still receives every event from the beginning.
 */
export class LiveMessage {
  readonly events: LiveEvent[] = [];
  readonly subject = new Subject<LiveEvent>();
  done = false;

  push(event: LiveEvent) {
    this.events.push(event);
    this.subject.next(event);
    if (event.type === 'done' || event.type === 'error') {
      this.done = true;
      this.subject.complete();
    }
  }
}
