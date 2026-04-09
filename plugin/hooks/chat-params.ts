import { setCurrentTurnSessionId } from "../lib/autosave"

export const chatParamHooks = () => {
  return {
    "chat.params": async (input: { sessionID: string }) => {
      setCurrentTurnSessionId(input.sessionID)
    },
  }
}
