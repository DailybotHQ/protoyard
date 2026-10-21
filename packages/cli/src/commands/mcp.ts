/** Start the machine protocol transport; stdout is reserved for JSON-RPC. */
export async function mcpCommand(): Promise<void> {
  const [{ serveMcpStdio }, { callMcpTool, MCP_TOOLS }] = await Promise.all([
    import('../mcp/stdio.ts'),
    import('../mcp/tools.ts'),
  ]);
  await serveMcpStdio({ tools: MCP_TOOLS, callTool: callMcpTool });
}
