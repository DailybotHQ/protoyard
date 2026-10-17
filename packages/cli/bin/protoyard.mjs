#!/usr/bin/env node
// Package entry point: the CLI ships TypeScript source (like every workspace
// package), so register tsx's loader and hand over to src/bin.ts.
import { register } from 'tsx/esm/api';

register();
await import('../src/bin.ts');
