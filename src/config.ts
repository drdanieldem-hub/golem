// Runtime configuration from the environment (.env is loaded if present).

try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on the real environment
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name} (see .env.example)`);
  return v;
}

export const config = {
  rpcUrl: () => required("RPC_URL"),
  mint: () => required("GOLEM_MINT"),
  treasuryKeypairPath: () => required("TREASURY_KEYPAIR"),
  jupApiBase: process.env.JUP_API_BASE ?? "https://lite-api.jup.ag/swap/v1",
  jupApiKey: process.env.JUP_API_KEY,
  /** Live trading only when explicitly set to "false". */
  dryRun: process.env.DRY_RUN !== "false",
  timelockHours: Number(process.env.TIMELOCK_HOURS ?? 24),
  stateFile: process.env.STATE_FILE ?? "data/state.json",
  policyFile: process.env.POLICY_FILE ?? "config/policy.json",
  mindModel: process.env.MIND_MODEL ?? "claude-opus-5-5",
};
