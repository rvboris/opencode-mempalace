/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { registerStatusHud } from "./hud"

const tui: TuiPlugin = async (api) => {
  await registerStatusHud(api)
}

const plugin: TuiPluginModule & { id: string } = {
  id: "rvboris.mempalace-hud",
  tui,
}

export default plugin
