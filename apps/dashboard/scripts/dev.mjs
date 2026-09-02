import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const children = new Set()
let shuttingDown = false

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = createServer()
      probe.once("error", () => resolve(false))
      probe.once("listening", () => probe.close(() => resolve(true)))
      probe.listen(port, "127.0.0.1")
    })
    if (available) return port
  }
  throw new Error(`No available development port found between ${startPort} and ${startPort + 19}.`)
}

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  })
  children.add(child)
  child.once("exit", (code, signal) => {
    children.delete(child)
    if (!shuttingDown) shutdown(code ?? (signal ? 1 : 0))
  })
  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill("SIGTERM")
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL")
    process.exit(exitCode)
  }, 1_000).unref()
  if (!children.size) process.exit(exitCode)
}

async function waitForApi(url, backend) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) throw new Error("The dashboard API stopped during startup.")
    try {
      const response = await fetch(`${url}/api/config`)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`The dashboard API did not become ready at ${url}.`)
}

process.once("SIGINT", () => shutdown(0))
process.once("SIGTERM", () => shutdown(0))

try {
  const apiPort = await findAvailablePort(43127)
  const apiUrl = `http://127.0.0.1:${apiPort}`
  const backend = start(
    packageManager,
    ["--filter", "@language-coach/server", "dev"],
    { LANGUAGE_COACH_PORT: String(apiPort) },
  )

  await waitForApi(apiUrl, backend)
  start(
    packageManager,
    ["--filter", "@language-coach/dashboard", "exec", "vite", "--host", "127.0.0.1", "--port", "43128"],
    { LANGUAGE_COACH_API_URL: apiUrl },
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  shutdown(1)
}
