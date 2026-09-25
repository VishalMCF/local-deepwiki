import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';

export interface BusEvent {
  channel: string;
  type: string;
  payload?: any;
}

/**
 * In-process pub/sub backing the SSE endpoints. Single-node by design: the API
 * spawns agent CLIs on this machine, so there is nothing to fan out to.
 */
@Injectable()
export class EventsService {
  private readonly subject = new Subject<BusEvent>();

  emit(channel: string, type: string, payload?: any) {
    this.subject.next({ channel, type, payload });
  }

  channel(channel: string): Observable<{ data: string }> {
    return this.subject.pipe(
      filter((e) => e.channel === channel),
      map((e) => ({ data: JSON.stringify({ type: e.type, ...(e.payload ?? {}) }) })),
    );
  }
}
