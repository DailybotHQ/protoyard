import { serveMcpStdio } from '../mcp/stdio.ts';

/** Start the machine protocol transport; stdout is reserved for JSON-RPC. */
export async function mcpCommand(): Promise<void> {
  await serveMcpStdio();
}
