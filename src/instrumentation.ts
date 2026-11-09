export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startJobs } = await import('./lib/jobs')
  await startJobs()
}
