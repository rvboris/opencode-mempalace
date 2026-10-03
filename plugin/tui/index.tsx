/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { registerStatusHud } from "./hud"

export default Plugin.define({
  id: "rvboris.mempalace-hud",
  setup: registerStatusHud,
})
