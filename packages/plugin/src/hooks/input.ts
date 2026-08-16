export async function readHookInput(): Promise<Record<string, unknown>> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input ? JSON.parse(input) as Record<string, unknown> : {};
}
