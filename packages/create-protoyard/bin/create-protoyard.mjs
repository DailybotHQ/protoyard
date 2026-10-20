#!/usr/bin/env node
// `npm create protoyard <dir>` / `pnpm create protoyard <dir>`.
import { main } from '../index.js';

process.exitCode = await main();
