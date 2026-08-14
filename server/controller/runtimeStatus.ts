export function controllerRuntimeStatus(env: NodeJS.ProcessEnv = process.env) {
  return {
    instanceCredentialKeyConfigured: Boolean(env.INSTANCE_CREDENTIAL_KEY),
  } as const;
}
