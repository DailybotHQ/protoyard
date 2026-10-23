import { mount } from 'svelte';
import TexuliLinkProbe from './TexuliLinkProbe.svelte';

const target = document.getElementById('app');
if (target) mount(TexuliLinkProbe, { target });
