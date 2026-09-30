import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps"
import { createRoot } from "react-dom/client"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { DashboardApp } from "../App"
import { McpDashboardClient } from "./client"
import "../styles.css"
import "./styles.css"

const root = createRoot(document.getElementById("root")!)
const app = new App({ name: "Language Coach", version: "0.1.5" }, {}, { autoResize: false })
function applyContext() {
  const context = app.getHostContext()
  if (context?.theme) {
    applyDocumentTheme(context.theme)
    document.documentElement.classList.toggle("dark", context.theme === "dark")
  }
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
}
app.onhostcontextchanged = (context) => {
  if (context.theme) {
    applyDocumentTheme(context.theme)
    document.documentElement.classList.toggle("dark", context.theme === "dark")
  }
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables)
}
app.ontoolinput = () => undefined
app.ontoolresult = () => undefined

function showError(error: unknown) {
  root.render(<main className="grid min-h-svh place-items-center p-6"><section role="alert"><h1>Language Coach could not connect</h1><p>{error instanceof Error ? error.message : "The host bridge is unavailable."}</p><button onClick={() => void start()}>Try again</button></section></main>)
}

async function start() {
  root.render(<main className="p-6" aria-busy="true">Connecting to Language Coach…</main>)
  try {
    await app.connect(undefined, { timeout: 10_000 })
    applyContext()
    const client = new McpDashboardClient(app)
    const embedded = { client, openStandalone: () => client.openStandalone() }
    root.render(<MemoryRouter initialEntries={["/dashboard"]}><Routes><Route path="/dashboard/*" element={<DashboardApp embedded={embedded} />} /></Routes></MemoryRouter>)
  } catch (error) {
    showError(error)
  }
}
void start()
