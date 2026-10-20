import './shell-base.ts';
import { CalendarView } from '@protoyard/views-ui/calendar';
import { mount } from 'svelte';

// Only CalendarView on the first screen: what the calendar view adds to initial JS.
mount(CalendarView as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
